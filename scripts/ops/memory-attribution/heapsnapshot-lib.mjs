/**
 * Minimal V8 .heapsnapshot reader + dominator tree + retained sizes (issue #709).
 * Dependency-free; reads the whole file into one Buffer (off the JS heap) and
 * parses the integer arrays by hand, because the snapshots are far beyond what
 * JSON.parse can take as a single string.
 *
 * Run consumers with a big old space, e.g. `node --max-old-space-size=16384`.
 */
import fs from "node:fs";

/** @returns the parsed snapshot with typed arrays and helper accessors. */
export function loadSnapshot(file) {
  const buf = fs.readFileSync(file);

  const nodesAt = buf.indexOf('"nodes":[');
  if (nodesAt < 0) throw new Error("not a heap snapshot: no nodes array");
  let headText = buf.toString("utf8", 0, nodesAt).trimEnd();
  if (headText.endsWith(",")) headText = headText.slice(0, -1);
  const head = JSON.parse(headText + "}");
  const meta = head.snapshot.meta;
  const nodeFields = meta.node_fields;
  const edgeFields = meta.edge_fields;
  const NF = nodeFields.length;
  const EF = edgeFields.length;
  const nodeCount = head.snapshot.node_count;
  const edgeCount = head.snapshot.edge_count;
  const nodeTypes = meta.node_types[0];
  const edgeTypes = meta.edge_types[0];

  const readUints = (start, count) => {
    const arr = new Uint32Array(count);
    let pos = start;
    let v = 0;
    let have = false;
    let i = 0;
    while (i < count) {
      const c = buf[pos++];
      if (c >= 48 && c <= 57) {
        v = v * 10 + (c - 48);
        have = true;
      } else if (c === 44 || c === 93) {
        if (have) {
          arr[i++] = v;
          v = 0;
          have = false;
        }
        if (c === 93) break;
      }
    }
    return { arr, pos };
  };

  const n = readUints(nodesAt + '"nodes":['.length, nodeCount * NF);
  const edgesAt = buf.indexOf('"edges":[', n.pos);
  const e = readUints(edgesAt + '"edges":['.length, edgeCount * EF);

  const stringsAt = buf.indexOf('"strings":[', e.pos);
  // `locations` (function -> script id / line / column) sits between edges and strings.
  let locations = new Uint32Array(0);
  const locAt = buf.indexOf('"locations":[', e.pos);
  const locationFields = meta.location_fields || ["object_index", "script_id", "line", "column"];
  if (locAt >= 0 && locAt < stringsAt) {
    // count first (cheap scan for commas), then read
    let commas = 0;
    let have = false;
    for (let p = locAt + '"locations":['.length; p < stringsAt; p++) {
      const c = buf[p];
      if (c >= 48 && c <= 57) have = true;
      else if (c === 44) {
        commas++;
        have = false;
      } else if (c === 93) {
        if (have) commas++;
        break;
      }
    }
    locations = readUints(locAt + '"locations":['.length, commas).arr;
  }
  const strings = [];
  {
    let pos = stringsAt + '"strings":['.length;
    const len = buf.length;
    while (pos < len) {
      const c = buf[pos];
      if (c === 93) break; // ]
      if (c !== 34) {
        pos++;
        continue;
      }
      const start = ++pos;
      let esc = false;
      while (pos < len) {
        const d = buf[pos];
        if (d === 92) {
          esc = true;
          pos += 2;
          continue;
        }
        if (d === 34) break;
        pos++;
      }
      strings.push(esc ? JSON.parse(`"${buf.toString("utf8", start, pos)}"`) : buf.toString("utf8", start, pos));
      pos++;
    }
  }

  const g = buildGraph({ nodes: n.arr, edges: e.arr, strings, NF, EF, nodeFields, edgeFields, nodeCount, edgeCount, nodeTypes, edgeTypes });
  g.locations = locations;
  g.locationFields = locationFields;
  return g;
}

function buildGraph(raw) {
  const { nodes, edges, strings, NF, EF, nodeCount, edgeCount, nodeTypes, edgeTypes } = raw;
  const fi = (name) => raw.nodeFields.indexOf(name);
  const F_TYPE = fi("type");
  const F_NAME = fi("name");
  const F_SIZE = fi("self_size");
  const F_ECOUNT = fi("edge_count");
  const F_ID = fi("id");

  const type = new Uint8Array(nodeCount);
  const name = new Uint32Array(nodeCount);
  const self = new Float64Array(nodeCount);
  const firstEdge = new Uint32Array(nodeCount + 1);
  for (let i = 0; i < nodeCount; i++) {
    const o = i * NF;
    type[i] = nodes[o + F_TYPE];
    name[i] = nodes[o + F_NAME];
    self[i] = nodes[o + F_SIZE];
    firstEdge[i + 1] = firstEdge[i] + nodes[o + F_ECOUNT];
  }
  const weak = edgeTypes.indexOf("weak");
  const shortcut = edgeTypes.indexOf("shortcut");
  const eType = (k) => edges[k * EF];
  const eName = (k) => edges[k * EF + 1];
  const eTo = (k) => edges[k * EF + 2] / NF;

  // ---- DFS (essential edges only) -> post order
  const postIndex = new Int32Array(nodeCount).fill(-1);
  const order = new Int32Array(nodeCount);
  let R = 0;
  {
    const seen = new Uint8Array(nodeCount);
    const stack = new Int32Array(nodeCount);
    const cursor = new Uint32Array(nodeCount);
    let sp = 0;
    stack[sp++] = 0;
    seen[0] = 1;
    cursor[0] = firstEdge[0];
    while (sp > 0) {
      const u = stack[sp - 1];
      if (cursor[u] < firstEdge[u + 1]) {
        const k = cursor[u]++;
        const t = eType(k);
        if (t === weak || t === shortcut) continue;
        const v = eTo(k);
        if (!seen[v]) {
          seen[v] = 1;
          cursor[v] = firstEdge[v];
          stack[sp++] = v;
        }
      } else {
        sp--;
        postIndex[u] = R;
        order[R++] = u;
      }
    }
  }

  // ---- predecessor CSR in post-index space
  const predStart = new Uint32Array(R + 1);
  for (let r = 0; r < R; r++) {
    const u = order[r];
    for (let k = firstEdge[u]; k < firstEdge[u + 1]; k++) {
      const t = eType(k);
      if (t === weak || t === shortcut) continue;
      predStart[postIndex[eTo(k)] + 1]++;
    }
  }
  for (let r = 0; r < R; r++) predStart[r + 1] += predStart[r];
  const fill = predStart.slice(0, R);
  const preds = new Int32Array(predStart[R]);
  for (let r = 0; r < R; r++) {
    const u = order[r];
    for (let k = firstEdge[u]; k < firstEdge[u + 1]; k++) {
      const t = eType(k);
      if (t === weak || t === shortcut) continue;
      preds[fill[postIndex[eTo(k)]]++] = r;
    }
  }

  // ---- dominators (Cooper-Harvey-Kennedy)
  const dom = new Int32Array(R).fill(-1);
  const root = R - 1;
  dom[root] = root;
  let changed = true;
  let passes = 0;
  while (changed) {
    changed = false;
    passes++;
    for (let i = R - 2; i >= 0; i--) {
      let nd = -1;
      for (let p = predStart[i]; p < predStart[i + 1]; p++) {
        const q = preds[p];
        if (dom[q] === -1) continue;
        if (nd === -1) nd = q;
        else {
          let a = q;
          let b = nd;
          while (a !== b) {
            while (a < b) a = dom[a];
            while (b < a) b = dom[b];
          }
          nd = a;
        }
      }
      if (nd !== -1 && dom[i] !== nd) {
        dom[i] = nd;
        changed = true;
      }
    }
  }

  // ---- retained sizes (post-index space)
  const retained = new Float64Array(R);
  for (let r = 0; r < R; r++) retained[r] = self[order[r]];
  for (let r = 0; r < R - 1; r++) retained[dom[r]] += retained[r];

  const str = (i) => strings[i] ?? "";
  return {
    nodeCount,
    edgeCount,
    reachable: R,
    domPasses: passes,
    NF,
    EF,
    type,
    name,
    self,
    order,
    postIndex,
    dom,
    retained,
    nodeTypes,
    edgeTypes,
    strings,
    firstEdge,
    edges,
    nodes,
    F_ID,
    typeName: (ord) => nodeTypes[type[ord]],
    nodeName: (ord) => str(name[ord]),
    edgeCountOf: (ord) => firstEdge[ord + 1] - firstEdge[ord],
    edgeType: (k) => edgeTypes[eType(k)],
    edgeTarget: (k) => eTo(k),
    edgeLabel: (k) => {
      const t = edgeTypes[eType(k)];
      const v = eName(k);
      return t === "element" || t === "hidden" ? `[${v}]` : str(v);
    },
    /** Dominator-tree parent (node ordinal) or -1 for the root. */
    domParent: (ord) => {
      const p = postIndex[ord];
      if (p < 0 || p === R - 1) return -1;
      return order[dom[p]];
    },
    retainedOf: (ord) => (postIndex[ord] >= 0 ? retained[postIndex[ord]] : 0),
  };
}
