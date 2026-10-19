#!/usr/bin/env node
/**
 * Attributes a V8 heap snapshot (issue #709): who owns the memory?
 *
 *   node --max-old-space-size=16384 analyze-heapsnapshot.mjs <file.heapsnapshot>
 *        [--md report.md] [--json report.json] [--top 30]
 *
 * Sections in the markdown report
 *   1. totals by V8 node type (shallow)
 *   2. DevTools-style class summary: shallow size and de-duplicated retained size
 *   3. the biggest single retainers, with their dominator chain
 *   4. strings: what the text is (script source / HTML cache / JSON / other)
 *   5. loaded scripts (JS files V8 compiled) and the source text each keeps
 *      resident, then the same text split per ORIGINAL module through the
 *      chunk's source map (so a 30 MB JSON seed bundled into a chunk shows up
 *      as that JSON, not as "some chunk")
 *   6. an ownership partition of the WHOLE heap: every node is given to the
 *      module that defines the closure/class it hangs off (nearest dominator
 *      with a known owner); what has none is reported as "(no owner)"
 *
 * Needs the .next3/server/chunks/*.js(.map) files at the paths recorded in the
 * snapshot (they are, when the snapshot was taken by run-instance.mjs and the
 * isolated folder is still there). Without the maps section 5/6 fall back to
 * per-file granularity.
 */
import fs from "node:fs";
import path from "node:path";
import { loadSnapshot } from "./heapsnapshot-lib.mjs";

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
if (!file) {
  console.error("usage: analyze-heapsnapshot.mjs <file.heapsnapshot> [--md out.md] [--json out.json] [--top 30]");
  process.exit(2);
}
const TOP = Number(opt("top", 30));
const MB = 1048576;
const mb = (n) => (n / MB).toFixed(1);

const t0 = Date.now();
const g = loadSnapshot(file);
const N = g.nodeCount;
const R = g.reachable;
const rootRetained = g.retained[R - 1];

// ---------------------------------------------------------------- helpers
const typeNames = g.nodeTypes;
const T_OBJECT = typeNames.indexOf("object");
const T_CODE = typeNames.indexOf("code");
const T_CLOSURE = typeNames.indexOf("closure");
const isStringType = (t) => t === "string" || t === "concatenated string" || t === "sliced string";
const strIdx = new Map();
g.strings.forEach((s, i) => {
  if (!strIdx.has(s)) strIdx.set(s, i);
});
const idxOf = (s) => (strIdx.has(s) ? strIdx.get(s) : -2);
const I_SOURCE = idxOf("source");
const I_SOD = idxOf("script_or_debug_info");
const I_SHARED = idxOf("shared");

// ---------------------------------------------------------------- 1. totals by type
const byType = new Map();
for (let i = 0; i < N; i++) {
  const t = g.typeName(i);
  const e = byType.get(t) || { count: 0, size: 0 };
  e.count++;
  e.size += g.self[i];
  byType.set(t, e);
}

// ---------------------------------------------------------------- 2. class summary
const classKey = (i) => {
  const t = g.typeName(i);
  switch (t) {
    case "object":
      return g.nodeName(i) || "(anonymous object)";
    case "native":
      return `[native] ${g.nodeName(i)}`;
    case "hidden":
      return "(system)";
    case "code":
      return "(compiled code)";
    case "closure":
      return "(closure)";
    case "array":
      return "(array)";
    case "string":
      return "(string)";
    case "concatenated string":
      return "(concatenated string)";
    case "sliced string":
      return "(sliced string)";
    case "number":
      return "(number)";
    case "regexp":
      return "(regexp)";
    case "object shape":
      return "(object shape)";
    case "synthetic":
      return `[synthetic] ${g.nodeName(i)}`;
    default:
      return `(${t})`;
  }
};
const classIds = new Map();
const classNames = [];
const classOf = new Int32Array(N);
{
  const cache = new Map();
  for (let i = 0; i < N; i++) {
    const t = g.type[i];
    const k = t * 4294967296 + g.name[i];
    let id = cache.get(k);
    if (id === undefined) {
      const key = classKey(i);
      id = classIds.get(key);
      if (id === undefined) {
        id = classNames.length;
        classIds.set(key, id);
        classNames.push(key);
      }
      cache.set(k, id);
    }
    classOf[i] = id;
  }
}
const C = classNames.length;
const classShallow = new Float64Array(C);
const classCount = new Int32Array(C);
for (let i = 0; i < N; i++) {
  classShallow[classOf[i]] += g.self[i];
  classCount[classOf[i]]++;
}
// dedup retained: walk the dominator tree, count a node's retained size only when no ancestor has the same class
const classRetained = new Float64Array(C);
{
  const childStart = new Uint32Array(R + 1);
  for (let r = 0; r < R - 1; r++) childStart[g.dom[r] + 1]++;
  for (let r = 0; r < R; r++) childStart[r + 1] += childStart[r];
  const fill = childStart.slice(0, R);
  const kids = new Int32Array(R);
  for (let r = 0; r < R - 1; r++) kids[fill[g.dom[r]]++] = r;
  const active = new Int32Array(C);
  const stack = new Int32Array(R + 1);
  const cursor = new Uint32Array(R);
  let sp = 0;
  const enter = (r) => {
    const c = classOf[g.order[r]];
    if (active[c] === 0) classRetained[c] += g.retained[r];
    active[c]++;
    cursor[r] = childStart[r];
    stack[sp++] = r;
  };
  enter(R - 1);
  while (sp > 0) {
    const r = stack[sp - 1];
    if (cursor[r] < childStart[r + 1]) enter(kids[cursor[r]++]);
    else {
      active[classOf[g.order[r]]]--;
      sp--;
    }
  }
}

// ---------------------------------------------------------------- scripts
const scriptNodes = []; // {node,pathRaw,path,srcNode,srcBytes}
const scriptOrdOfNode = new Int32Array(N).fill(-1);
for (let i = 0; i < N; i++) {
  if (g.type[i] !== T_CODE) continue;
  for (let k = g.firstEdge[i]; k < g.firstEdge[i + 1]; k++) {
    if (g.edges[k * g.EF + 1] === I_SOURCE && g.edgeType(k) === "internal") {
      const nm = g.nodeName(i);
      const src = g.edgeTarget(k);
      scriptOrdOfNode[i] = scriptNodes.length;
      scriptNodes.push({ node: i, pathRaw: nm, path: nm.replace(/\\/g, "/"), srcNode: src, srcBytes: g.self[src] });
      break;
    }
  }
}
// SFI -> script, closure -> SFI
const sfiScript = new Int32Array(N).fill(-1);
const sharedOf = new Int32Array(N).fill(-1);
for (let i = 0; i < N; i++) {
  const t = g.type[i];
  if (t !== T_CODE && t !== T_CLOSURE) continue;
  for (let k = g.firstEdge[i]; k < g.firstEdge[i + 1]; k++) {
    const nm = g.edges[k * g.EF + 1];
    if (nm === I_SOD && t === T_CODE) {
      const to = g.edgeTarget(k);
      if (scriptOrdOfNode[to] >= 0) sfiScript[i] = scriptOrdOfNode[to];
    } else if (nm === I_SHARED && t === T_CLOSURE) {
      sharedOf[i] = g.edgeTarget(k);
    }
  }
}
const scriptOfNode = (i) => {
  if (scriptOrdOfNode[i] >= 0) return scriptOrdOfNode[i];
  if (sfiScript[i] >= 0) return sfiScript[i];
  if (g.type[i] === T_CLOSURE && sharedOf[i] >= 0) return sfiScript[sharedOf[i]];
  return -1;
};

// ---- source maps
const mapCache = new Map();
const VLQ = new Int8Array(128).fill(-1);
"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("").forEach((c, i) => (VLQ[c.charCodeAt(0)] = i));
function loadMap(scriptPath) {
  if (mapCache.has(scriptPath)) return mapCache.get(scriptPath);
  let result = null;
  const mp = `${scriptPath}.map`;
  try {
    if (fs.existsSync(mp)) {
      const m = JSON.parse(fs.readFileSync(mp, "utf8"));
      if (m.mappings && m.sources) {
        const lines = [];
        let src = 0;
        let sl = 0;
        let sc = 0;
        let nm = 0;
        for (const lineText of m.mappings.split(";")) {
          const cols = [];
          const srcs = [];
          let gc = 0;
          if (lineText.length) {
            for (const seg of lineText.split(",")) {
              const vals = [];
              let shift = 0;
              let val = 0;
              for (let p = 0; p < seg.length; p++) {
                const d = VLQ[seg.charCodeAt(p)];
                val |= (d & 31) << shift;
                if (d & 32) shift += 5;
                else {
                  vals.push(val & 1 ? -(val >> 1) : val >> 1);
                  val = 0;
                  shift = 0;
                }
              }
              if (!vals.length) continue;
              gc += vals[0];
              if (vals.length >= 4) {
                src += vals[1];
                sl += vals[2];
                sc += vals[3];
                if (vals.length >= 5) nm += vals[4];
                cols.push(gc);
                srcs.push(src);
              } else {
                cols.push(gc);
                srcs.push(-1);
              }
            }
          }
          lines.push({ cols: Int32Array.from(cols), srcs: Int32Array.from(srcs) });
        }
        result = { sources: m.sources, lines };
      }
    }
  } catch {
    result = null;
  }
  mapCache.set(scriptPath, result);
  return result;
}
function lookup(map, line, col) {
  const L = map.lines[line];
  if (!L || !L.cols.length) return -1;
  let lo = 0;
  let hi = L.cols.length - 1;
  if (col < L.cols[0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (L.cols[mid] <= col) lo = mid;
    else hi = mid - 1;
  }
  return L.srcs[lo];
}

// ---- labels
function normSource(s) {
  let p = s.replace(/\\/g, "/").replace(/^turbopack:\/\/\//, "").replace(/^\[project\]\//, "");
  p = p.replace(/^(\.\.\/)+/, "");
  return p;
}
function sourceLabel(src) {
  const p = normSource(src);
  let m = /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\/(.*)$/.exec(p);
  if (m) {
    const pkg = m[1];
    if (pkg === "next") return { fine: `next(bundled)/${m[2].split("/").slice(0, 3).join("/")}`, coarse: "Next internals bundled into app chunks", file: p };
    if (pkg === "react" || pkg === "react-dom") return { fine: `${pkg}(bundled)`, coarse: "React bundled into app chunks", file: p };
    return { fine: `node_modules/${pkg}`, coarse: `lib: ${pkg}`, file: p };
  }
  if (/\.json$/.test(p)) return { fine: p, coarse: "static JSON bundled in code", file: p };
  if (/^(app|components|lib|middleware|instrumentation|types|config|locales)\b/.test(p)) {
    const segs = p.split("/");
    return { fine: segs.slice(0, Math.min(3, segs.length - 1) || 1).join("/") + "/", coarse: "our code", file: p };
  }
  return { fine: p, coarse: "other", file: p };
}
function scriptLabel(sc) {
  const p = sc.path;
  let m;
  if ((m = /\/\.next3\/server\/chunks\/(?:ssr\/)?(.+)_json_\[json\]_cjs_[^/]*\.js$/.exec(p))) {
    // a JSON file compiled into its own CommonJS chunk (the name is the path with / replaced by _)
    return { fine: `(json chunk) ${m[1]}`, coarse: "static JSON bundled in code" };
  }
  if (/\/\.next3\/server\/chunks\//.test(p)) return { fine: `(chunk) ${path.basename(p)}`, coarse: "app bundle chunks (unresolved)" };
  if (/\/\.next3\/server\/(app|pages)\//.test(p) || /\/\.next3\/server\/[^/]+\.js$/.test(p)) return { fine: `(entry) ${p.split("/.next3/server/")[1]}`, coarse: "app route entries" };
  if (/\/node_modules\/next\/dist\/compiled\/next-server\//.test(p)) return { fine: `next/dist/compiled/next-server/${path.basename(p)}`, coarse: "Next+React vendored runtime (next-server)" };
  if ((m = /\/node_modules\/next\/dist\/compiled\/([^/]+)/.exec(p))) return { fine: `next/dist/compiled/${m[1]}`, coarse: "Next vendored libs (dist/compiled)" };
  if (/\/node_modules\/next\/dist\//.test(p)) return { fine: `next/dist/${p.split("/node_modules/next/dist/")[1]}`, coarse: "Next server code (dist)" };
  if ((m = /\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(p))) return { fine: `node_modules/${m[1]}/${path.basename(p)}`, coarse: `lib: ${m[1]}` };
  if (/^node:|^[a-z_]+$/.test(p) || !/[/]/.test(p)) return { fine: p || "(unnamed)", coarse: "Node internals" };
  return { fine: p, coarse: "other" };
}

// ---- per-script source text split by original module
const scriptInfo = scriptNodes.map((sc) => {
  const info = { ...sc, label: scriptLabel(sc), modules: null };
  return info;
});
const perModuleSource = new Map(); // fine -> {coarse, bytes, files:Set}
const addModuleSource = (lbl, bytes, scriptName) => {
  const e = perModuleSource.get(lbl.fine) || { coarse: lbl.coarse, bytes: 0, scripts: new Set() };
  e.bytes += bytes;
  e.scripts.add(scriptName);
  perModuleSource.set(lbl.fine, e);
};
for (const sc of scriptInfo) {
  if (sc.label.coarse === "app bundle chunks (unresolved)") {
    const map = loadMap(sc.pathRaw);
    let text = null;
    try {
      text = fs.readFileSync(sc.pathRaw, "utf8");
    } catch {
      text = null;
    }
    if (map && text) {
      const lines = text.split("\n");
      const totalChars = text.length;
      const perChar = sc.srcBytes / Math.max(1, totalChars);
      const acc = new Map();
      let covered = 0;
      for (let li = 0; li < lines.length && li < map.lines.length; li++) {
        const L = map.lines[li];
        const lineLen = lines[li].length;
        for (let s = 0; s < L.cols.length; s++) {
          const start = L.cols[s];
          const end = s + 1 < L.cols.length ? L.cols[s + 1] : lineLen;
          const len = Math.max(0, end - start);
          const lbl = L.srcs[s] >= 0 ? sourceLabel(map.sources[L.srcs[s]]) : { fine: "(chunk runtime / unmapped)", coarse: "bundler glue" };
          const key = lbl.fine;
          const e = acc.get(key) || { lbl, chars: 0 };
          e.chars += len;
          acc.set(key, e);
          covered += len;
        }
      }
      // Turbopack emits a JSON module as `module.exports=[id,(e,t,a)=>{t.exports=JSON.parse('...')}]`
      // WITHOUT any mapping inside the literal, so the tail of the previous segment swallows it.
      // Move big JSON.parse literals out of whatever segment they fell into and onto the
      // bundled .json source (the map's only .json source, or the one named in the chunk file).
      const jsonSources = map.sources.map((s) => normSource(s)).filter((s) => /\.json$/.test(s));
      if (jsonSources.length) {
        const re = /JSON\.parse\((['"])/g;
        const l0 = lines[0] || "";
        let mm;
        const lits = [];
        while ((mm = re.exec(l0))) {
          const q = mm[1];
          let p = mm.index + mm[0].length;
          const start = p;
          while (p < l0.length) {
            const ch = l0.charCodeAt(p);
            if (ch === 92) p += 2;
            else if (l0[p] === q) break;
            else p++;
          }
          if (p - start >= 16384) lits.push({ start, len: p - start });
          re.lastIndex = p;
        }
        // which source label does each literal currently belong to?
        const segAt = (col) => {
          const Lm = map.lines[0];
          let lo = 0;
          let hi = Lm.cols.length - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (Lm.cols[mid] <= col) lo = mid;
            else hi = mid - 1;
          }
          return Lm.srcs[lo];
        };
        lits.forEach((lit, n) => {
          const from = segAt(lit.start);
          const fromLbl = from >= 0 ? sourceLabel(map.sources[from]).fine : "(chunk runtime / unmapped)";
          const target = jsonSources.length === 1 ? jsonSources[0] : jsonSources[Math.min(n, jsonSources.length - 1)];
          const toLbl = sourceLabel(target);
          const fe = acc.get(fromLbl);
          if (fe) fe.chars -= lit.len;
          const te = acc.get(toLbl.fine) || { lbl: toLbl, chars: 0 };
          te.chars += lit.len;
          acc.set(toLbl.fine, te);
        });
      }
      const rest = totalChars - covered;
      if (rest > 0) {
        const lbl = { fine: "(chunk runtime / unmapped)", coarse: "bundler glue" };
        const e = acc.get(lbl.fine) || { lbl, chars: 0 };
        e.chars += rest;
        acc.set(lbl.fine, e);
      }
      for (const { lbl, chars } of acc.values()) addModuleSource(lbl, chars * perChar, path.basename(sc.pathRaw));
      sc.modules = acc.size;
      continue;
    }
  }
  addModuleSource(sc.label, sc.srcBytes, path.basename(sc.pathRaw));
}

// ---------------------------------------------------------------- 6. ownership partition
// owner id -> label
const ownerLabels = [];
const ownerIds = new Map();
const ownerId = (fine, coarse) => {
  const key = `${coarse}\u0000${fine}`;
  let id = ownerIds.get(key);
  if (id === undefined) {
    id = ownerLabels.length;
    ownerLabels.push({ fine, coarse });
    ownerIds.set(key, id);
  }
  return id;
};
const NO_OWNER = ownerId("(no owner: held by globals / runtime)", "(no owner)");
const owner = new Int32Array(N).fill(-1);
// script_id -> script ordinal, learned from located closures
const scriptIdToOrd = new Map();
const L = g.locations;
const locOf = new Map(); // node -> [scriptId,line,col]
for (let j = 0; j + 3 < L.length; j += 4) locOf.set(L[j] / g.NF, j);
for (const [node, j] of locOf) {
  if (g.type[node] === T_CLOSURE) {
    const so = scriptOfNode(node);
    if (so >= 0 && !scriptIdToOrd.has(L[j + 1])) scriptIdToOrd.set(L[j + 1], so);
  }
}
const srcLabelCache = new Map();
const labelForLocation = (scriptOrd, line, col) => {
  const sc = scriptInfo[scriptOrd];
  const map = sc.label.coarse === "app bundle chunks (unresolved)" ? loadMap(sc.pathRaw) : null;
  if (map) {
    const si = lookup(map, line, col);
    if (si >= 0) {
      const key = `${scriptOrd}:${si}`;
      let id = srcLabelCache.get(key);
      if (id === undefined) {
        const lbl = sourceLabel(map.sources[si]);
        id = ownerId(lbl.fine, lbl.coarse);
        srcLabelCache.set(key, id);
      }
      return id;
    }
    return ownerId("(chunk runtime / unmapped)", "bundler glue");
  }
  return ownerId(sc.label.fine, sc.label.coarse);
};
const sourceStringOwner = new Map(); // string node -> owner id
for (const sc of scriptInfo) sourceStringOwner.set(sc.srcNode, ownerId(`(script source text) ${sc.label.coarse}`, `script source text: ${sc.label.coarse.split(":")[0]}`));
const I_MODULE = idxOf("Module");
// An ES-module namespace object ("Module") has no location of its own; the module it
// stands for is the one that defined its exported functions (getters live behind an
// AccessorPair, so look two edges deep).
const ownerFromExports = (i) => {
  let seen = 0;
  for (let k = g.firstEdge[i]; k < g.firstEdge[i + 1] && seen < 40; k++, seen++) {
    const to = g.edgeTarget(k);
    const cands = [to];
    if (g.typeName(to) !== "closure") {
      for (let q = g.firstEdge[to]; q < g.firstEdge[to + 1] && q < g.firstEdge[to] + 4; q++) cands.push(g.edgeTarget(q));
    }
    for (const c of cands) {
      if (g.type[c] === T_CLOSURE && locOf.has(c)) {
        const so = scriptOfNode(c);
        const j = locOf.get(c);
        if (so >= 0) return labelForLocation(so, L[j + 2], L[j + 3]);
      }
    }
  }
  return -1;
};
const directOwner = (i) => {
  const t = g.type[i];
  if (t === T_OBJECT && g.name[i] === I_MODULE && !locOf.has(i)) {
    const o = ownerFromExports(i);
    if (o >= 0) return o;
  }
  if (t === T_CLOSURE || t === T_OBJECT) {
    // closure or object: located?
    const j = locOf.get(i);
    if (j !== undefined) {
      let so = t === T_CLOSURE ? scriptOfNode(i) : scriptIdToOrd.get(L[j + 1]) ?? -1;
      if (so < 0) so = scriptIdToOrd.get(L[j + 1]) ?? -1;
      if (so >= 0) return labelForLocation(so, L[j + 2], L[j + 3]);
    }
    if (t === T_CLOSURE) {
      const so = scriptOfNode(i);
      if (so >= 0) return ownerId(scriptInfo[so].label.fine, scriptInfo[so].label.coarse);
    }
  } else if (t === T_CODE) {
    if (sourceStringOwner.has(i)) return sourceStringOwner.get(i);
    const so = scriptOfNode(i);
    if (so >= 0) return ownerId(scriptInfo[so].label.fine, scriptInfo[so].label.coarse);
  } else if (isStringType(g.typeName(i)) && sourceStringOwner.has(i)) {
    return sourceStringOwner.get(i);
  }
  return -1;
};
for (let r = R - 2; r >= 0; r--) {
  const i = g.order[r];
  const d = directOwner(i);
  if (d >= 0) owner[i] = d;
  else {
    const p = g.order[g.dom[r]];
    owner[i] = owner[p] >= 0 ? owner[p] : NO_OWNER;
  }
}
owner[g.order[R - 1]] = NO_OWNER;
const ownerSize = new Float64Array(ownerLabels.length);
for (let i = 0; i < N; i++) if (g.postIndex[i] >= 0) ownerSize[owner[i] >= 0 ? owner[i] : NO_OWNER] += g.self[i];
const coarseSize = new Map();
ownerLabels.forEach((l, id) => coarseSize.set(l.coarse, (coarseSize.get(l.coarse) || 0) + ownerSize[id]));

// ---------------------------------------------------------------- 4. strings
const strClass = (txt) => {
  if (/^module\.exports=\[|^\(\(\)=>\{|^\(globalThis\.TURBOPACK|^"use strict"|^\/\*|^\(function/.test(txt)) return "JS source";
  if (/^<!doctype html|^<!DOCTYPE html|^<html/i.test(txt)) return "HTML page text (render/ISR cache)";
  if (/^\s*[\[{]/.test(txt)) return "JSON text";
  if (/^\d+:|^[0-9a-f]+:[A-Z]\[|^\{"|^:HL/.test(txt)) return "RSC/flight payload";
  return "other";
};
const stringStats = new Map();
const bigStrings = [];
for (let i = 0; i < N; i++) {
  if (g.postIndex[i] < 0 || !isStringType(g.typeName(i))) continue;
  const sz = g.self[i];
  let cls;
  if (sourceStringOwner.has(i)) cls = "script source (tied to a Script)";
  else if (sz < 4096) cls = "small strings (<4 KB each)";
  else cls = strClass(g.nodeName(i));
  const e = stringStats.get(cls) || { count: 0, size: 0 };
  e.count++;
  e.size += sz;
  stringStats.set(cls, e);
  if (sz >= 65536 && !sourceStringOwner.has(i)) bigStrings.push(i);
}
bigStrings.sort((a, b) => g.self[b] - g.self[a]);

// ---------------------------------------------------------------- 3. top retainers
const ordByRet = [];
for (let r = 0; r < R - 1; r++) ordByRet.push(r);
ordByRet.sort((a, b) => g.retained[b] - g.retained[a]);
const chain = (i) => {
  const out = [];
  let p = g.domParent(i);
  for (let k = 0; k < 5 && p >= 0; k++) {
    out.push(`${g.typeName(p)}:${g.nodeName(p).replace(/^.*[\\/]/, "").slice(0, 36)}`);
    p = g.domParent(p);
  }
  return out.join(" < ");
};

// ---------------------------------------------------------------- report
const md = [];
const J = {
  file,
  heapMB: g.self.reduce((s, v) => s + v, 0) / MB,
  reachableMB: rootRetained / MB,
  nodes: N,
  edges: g.edgeCount,
};
md.push(`# Heap snapshot analysis: ${path.basename(file)}`);
md.push(`\nnodes ${N.toLocaleString()}, edges ${g.edgeCount.toLocaleString()}, reachable heap ${mb(rootRetained)} MB, analysed in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

md.push(`## 1. By V8 node type (shallow)\n`);
md.push(`| type | count | MB |\n|---|---:|---:|`);
J.byType = {};
for (const [t, e] of [...byType.entries()].sort((a, b) => b[1].size - a[1].size)) {
  if (e.size < 1024) continue;
  md.push(`| ${t} | ${e.count.toLocaleString()} | ${mb(e.size)} |`);
  J.byType[t] = e.size / MB;
}

md.push(`\n## 2. Classes (DevTools Summary style)\n`);
md.push(`Retained = de-duplicated (a node counts only if no dominator ancestor has the same class).\n`);
md.push(`| class | count | shallow MB | retained MB |\n|---|---:|---:|---:|`);
const classOrder = [...Array(C).keys()].sort((a, b) => classRetained[b] - classRetained[a]);
J.classes = [];
for (const c of classOrder.slice(0, TOP)) {
  md.push(`| ${classNames[c].replace(/\|/g, "\\|").slice(0, 70)} | ${classCount[c].toLocaleString()} | ${mb(classShallow[c])} | ${mb(classRetained[c])} |`);
  J.classes.push({ name: classNames[c], count: classCount[c], shallowMB: classShallow[c] / MB, retainedMB: classRetained[c] / MB });
}
md.push(`\nTop by shallow size:\n`);
md.push(`| class | count | shallow MB |\n|---|---:|---:|`);
for (const c of [...Array(C).keys()].sort((a, b) => classShallow[b] - classShallow[a]).slice(0, 15)) {
  md.push(`| ${classNames[c].replace(/\|/g, "\\|").slice(0, 70)} | ${classCount[c].toLocaleString()} | ${mb(classShallow[c])} |`);
}

// a few property names of an object (or of the first element of an array), to recognise parsed JSON
const propsOf = (i, limit = 6) => {
  const out = [];
  for (let k = g.firstEdge[i]; k < g.firstEdge[i + 1] && out.length < limit; k++) {
    const t = g.edgeType(k);
    if (t === "property") out.push(g.edgeLabel(k));
  }
  return out;
};
const peek = (i) => {
  if (g.typeName(i) !== "object") return "";
  const nm = g.nodeName(i);
  if (nm === "Array") {
    for (let k = g.firstEdge[i]; k < g.firstEdge[i + 1]; k++) {
      if (g.edgeLabel(k) === "elements") {
        const arr = g.edgeTarget(k);
        for (let q = g.firstEdge[arr]; q < g.firstEdge[arr + 1]; q++) {
          const first = g.edgeTarget(q);
          const n = g.firstEdge[arr + 1] - g.firstEdge[arr];
          return `[${n} items] first: {${propsOf(first).join(",")}}`;
        }
      }
    }
    return "";
  }
  const p = propsOf(i);
  return p.length ? `{${p.join(",")}}` : "";
};

md.push(`\n## 3. Biggest single retainers (by retained size)\n`);
md.push(`| retained MB | shallow KB | type | name | peek | dominator chain (nearest first) |\n|---:|---:|---|---|---|---|`);
for (const r of ordByRet.slice(0, TOP)) {
  const i = g.order[r];
  md.push(`| ${mb(g.retained[r])} | ${(g.self[i] / 1024).toFixed(0)} | ${g.typeName(i)} | ${g.nodeName(i).replace(/^.*[\\/]/, "").replace(/\|/g, "\\|").slice(0, 40)} | ${peek(i).replace(/\|/g, "\\|").slice(0, 70)} | ${chain(i).replace(/\|/g, "\\|")} |`);
}

md.push(`\n## 4. Strings\n`);
md.push(`| what | count | MB |\n|---|---:|---:|`);
J.strings = {};
for (const [k, e] of [...stringStats.entries()].sort((a, b) => b[1].size - a[1].size)) {
  md.push(`| ${k} | ${e.count.toLocaleString()} | ${mb(e.size)} |`);
  J.strings[k] = e.size / MB;
}
md.push(`\nStrings >= 64 KB that are NOT script source (top ${Math.min(15, bigStrings.length)} of ${bigStrings.length}):\n`);
md.push(`| MB | kind | starts with | held by |\n|---:|---|---|---|`);
for (const i of bigStrings.slice(0, 15)) {
  const txt = g.nodeName(i);
  md.push(`| ${mb(g.self[i])} | ${strClass(txt)} | \`${txt.slice(0, 60).replace(/[`|\r\n]/g, " ")}\` | ${chain(i).replace(/\|/g, "\\|").slice(0, 120)} |`);
}

md.push(`\n## 5. Loaded scripts and the source text they keep resident\n`);
const byCoarseScript = new Map();
for (const sc of scriptInfo) byCoarseScript.set(sc.label.coarse, (byCoarseScript.get(sc.label.coarse) || 0) + sc.srcBytes);
md.push(`${scriptInfo.length} scripts, ${mb(scriptInfo.reduce((s, x) => s + x.srcBytes, 0))} MB of source text.\n`);
md.push(`| script group | source MB |\n|---|---:|`);
J.scriptGroups = {};
for (const [k, v] of [...byCoarseScript.entries()].sort((a, b) => b[1] - a[1])) {
  md.push(`| ${k} | ${mb(v)} |`);
  J.scriptGroups[k] = v / MB;
}
md.push(`\nSource text per ORIGINAL module (chunks split through their source maps), top ${TOP}:\n`);
md.push(`| source MB | group | module | in script(s) |\n|---:|---|---|---|`);
J.modules = [];
const modOrder = [...perModuleSource.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
for (const [fine, e] of modOrder.slice(0, TOP)) {
  md.push(`| ${mb(e.bytes)} | ${e.coarse} | ${fine.replace(/\|/g, "\\|").slice(0, 80)} | ${[...e.scripts].slice(0, 2).join(", ").slice(0, 40)} |`);
}
for (const [fine, e] of modOrder) J.modules.push({ module: fine, group: e.coarse, MB: e.bytes / MB });
const byCoarseModule = new Map();
for (const [, e] of perModuleSource) byCoarseModule.set(e.coarse, (byCoarseModule.get(e.coarse) || 0) + e.bytes);
md.push(`\nSame text grouped:\n`);
md.push(`| group | source MB |\n|---|---:|`);
J.moduleGroups = {};
for (const [k, v] of [...byCoarseModule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  md.push(`| ${k} | ${mb(v)} |`);
  J.moduleGroups[k] = v / MB;
}

md.push(`\n## 6. Ownership of the whole heap (shallow sizes, no double counting)\n`);
md.push(`Every node is given to the module that defines the closure/class it hangs off (nearest dominator with a known owner). The JS text V8 keeps for each compiled file ("source text") is split per ORIGINAL module through the source maps (section 5) and shown in its own column; "code + data" is everything else owned by the same module (bytecode, feedback, closures, objects, caches it created).\n`);
// merge: partition without the per-script source-text buckets, plus the per-module source text
const isSrcBucket = (id) => ownerLabels[id].coarse.startsWith("script source text:");
const groupSrc = new Map();
const groupOther = new Map();
const modSrc = new Map();
const modOther = new Map();
const modGroup = new Map();
for (const [fine, e] of perModuleSource) {
  groupSrc.set(e.coarse, (groupSrc.get(e.coarse) || 0) + e.bytes);
  modSrc.set(fine, (modSrc.get(fine) || 0) + e.bytes);
  modGroup.set(fine, e.coarse);
}
ownerLabels.forEach((l, id) => {
  if (isSrcBucket(id)) return;
  groupOther.set(l.coarse, (groupOther.get(l.coarse) || 0) + ownerSize[id]);
  modOther.set(l.fine, (modOther.get(l.fine) || 0) + ownerSize[id]);
  if (!modGroup.has(l.fine)) modGroup.set(l.fine, l.coarse);
});
md.push(`| owner group | source text MB | code + data MB | total MB |\n|---|---:|---:|---:|`);
J.owners = {};
const allGroups = new Set([...groupSrc.keys(), ...groupOther.keys()]);
const groupRows = [...allGroups].map((k) => ({ k, s: groupSrc.get(k) || 0, o: groupOther.get(k) || 0 })).sort((a, b) => b.s + b.o - (a.s + a.o));
for (const r of groupRows.slice(0, 40)) {
  if (r.s + r.o < 0.05 * MB) continue;
  md.push(`| ${r.k} | ${mb(r.s)} | ${mb(r.o)} | ${mb(r.s + r.o)} |`);
  J.owners[r.k] = (r.s + r.o) / MB;
}
md.push(`\nTop ${TOP} owners (module level):\n`);
md.push(`| total MB | source text MB | code + data MB | group | owner |\n|---:|---:|---:|---|---|`);
J.ownerModules = [];
const allMods = new Set([...modSrc.keys(), ...modOther.keys()]);
const modRows = [...allMods].map((k) => ({ k, s: modSrc.get(k) || 0, o: modOther.get(k) || 0, grp: modGroup.get(k) })).sort((a, b) => b.s + b.o - (a.s + a.o));
for (const r of modRows.slice(0, TOP)) md.push(`| ${mb(r.s + r.o)} | ${mb(r.s)} | ${mb(r.o)} | ${r.grp} | ${r.k.replace(/\|/g, "\\|").slice(0, 80)} |`);
for (const r of modRows.slice(0, 300)) J.ownerModules.push({ owner: r.k, group: r.grp, MB: (r.s + r.o) / MB, sourceMB: r.s / MB, otherMB: r.o / MB });

// what is left without an owner, by node type and by class
{
  const byT = new Map();
  const byC = new Map();
  for (let i = 0; i < N; i++) {
    if (g.postIndex[i] < 0 || owner[i] !== NO_OWNER) continue;
    byT.set(g.typeName(i), (byT.get(g.typeName(i)) || 0) + g.self[i]);
    byC.set(classNames[classOf[i]], (byC.get(classNames[classOf[i]]) || 0) + g.self[i]);
  }
  md.push(`\n## 7. Nodes with no owner, by type and class (shallow MB)\n`);
  md.push(`| node type | MB |\n|---|---:|`);
  J.noOwnerByType = {};
  for (const [k, v] of [...byT.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    md.push(`| ${k} | ${mb(v)} |`);
    J.noOwnerByType[k] = v / MB;
  }
  md.push(`\n| class | MB |\n|---|---:|`);
  for (const [k, v] of [...byC.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) md.push(`| ${k.replace(/\|/g, "\\|").slice(0, 60)} | ${mb(v)} |`);
}

// ownership of the leftover: split the heap into the big holders (same signatures as
// partition-known-holders.mjs) and show, for what is NOT inside any of them, who owns it.
{
  const I_LRU = idxOf("LRUCache");
  const rootKind = new Int8Array(N);
  for (const sc of scriptInfo) rootKind[sc.srcNode] = 1;
  for (let i = 0; i < N; i++) {
    if (g.postIndex[i] < 0 || g.type[i] !== T_OBJECT) continue;
    if (g.name[i] === I_LRU) rootKind[i] = 2;
    const props = [];
    for (let k = g.firstEdge[i]; k < g.firstEdge[i + 1] && props.length < 8; k++) if (g.edgeType(k) === "property") props.push(g.edgeLabel(k));
    if (props.includes("version") && props.includes("generatedAt") && props.includes("languages")) rootKind[i] = 3;
    if (g.name[i] === I_MODULE && props.includes("getHeritageMapData")) rootKind[i] = 4;
  }
  const cat = new Int8Array(N);
  const holder = [0, 0, 0, 0, 0];
  const restByOwner = new Map();
  const restNoOwnerByType = new Map();
  for (let r = R - 1; r >= 0; r--) {
    const i = g.order[r];
    const c = rootKind[i] ? rootKind[i] : r === R - 1 ? 0 : cat[g.order[g.dom[r]]];
    cat[i] = c;
    holder[c] += g.self[i];
    if (c === 0) {
      const o = owner[i] >= 0 ? owner[i] : NO_OWNER;
      const key = ownerLabels[o].coarse;
      restByOwner.set(key, (restByOwner.get(key) || 0) + g.self[i]);
      if (o === NO_OWNER) restNoOwnerByType.set(g.typeName(i), (restNoOwnerByType.get(g.typeName(i)) || 0) + g.self[i]);
    }
  }
  md.push(`\n## 8. The leftover after the big holders\n`);
  md.push(`Disjoint split: JS source text ${mb(holder[1])}, Next LRU page cache ${mb(holder[2])}, dictionary parsed objects ${mb(holder[3])}, culture parsed data ${mb(holder[4])}, everything else ${mb(holder[0])} MB. Who owns the "everything else" (shallow MB):\n`);
  md.push(`| owner group | MB |\n|---|---:|`);
  J.holders = { sourceText: holder[1] / MB, lruCache: holder[2] / MB, dictionaryParsed: holder[3] / MB, cultureParsed: holder[4] / MB, rest: holder[0] / MB };
  J.restByOwner = {};
  for (const [k, v] of [...restByOwner.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    if (v < 0.05 * MB) continue;
    md.push(`| ${k} | ${mb(v)} |`);
    J.restByOwner[k] = v / MB;
  }
  md.push(`\nThe "(no owner)" part of the leftover, by V8 node type (shallow MB):\n`);
  md.push(`| node type | MB |\n|---|---:|`);
  J.restNoOwnerByType = {};
  for (const [k, v] of [...restNoOwnerByType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    md.push(`| ${k} | ${mb(v)} |`);
    J.restNoOwnerByType[k] = v / MB;
  }
}

const text = md.join("\n") + "\n";
if (opt("md")) fs.writeFileSync(opt("md"), text);
else console.log(text);
if (opt("json")) fs.writeFileSync(opt("json"), JSON.stringify(J, null, 2));
