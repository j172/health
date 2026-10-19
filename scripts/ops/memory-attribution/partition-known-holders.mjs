#!/usr/bin/env node
/**
 * Disjoint split of a heap snapshot into the big holders found in issue #709,
 * plus "everything else" (so the rows add up to the snapshot's reachable heap).
 *
 *   node --max-old-space-size=16384 partition-known-holders.mjs <file.heapsnapshot>
 *
 * Because every node belongs to exactly one dominator subtree, a node is counted
 * under the nearest chosen holder above it:
 *   1. JS source text      the `source` string of every compiled Script
 *   2. Next page cache     any LRUCache object (next/dist/server/lib/lru-cache.js)
 *   3. dictionary parsed   the object {version, generatedAt, languages} that
 *                          JSON.parse made from data/child-native-languages-seed.json
 *   4. culture data        the ES-module namespace exporting getHeritageMapData
 *                          (lib/server/culture/queries.ts: parsed public-art + events)
 *   0. rest                everything else (bytecode, closures, hidden classes, ...)
 * The signatures of 3 and 4 are specific to this repo at the time of writing; the
 * generic tool is analyze-heapsnapshot.mjs (section 3 lists the biggest retainers).
 */
import { loadSnapshot } from "./heapsnapshot-lib.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: partition-known-holders.mjs <file.heapsnapshot>");
  process.exit(2);
}
const g = loadSnapshot(file);
const N = g.nodeCount;
const R = g.reachable;
const T = g.nodeTypes;
const T_CODE = T.indexOf("code");
const T_OBJECT = T.indexOf("object");
const names = ["(rest)", "script source text", "Next LRU page cache", "dictionary parsed objects", "culture parsed data"];
const idx = (s) => g.strings.indexOf(s);
const I_SOURCE = idx("source");
const I_LRU = idx("LRUCache");
const I_MODULE = idx("Module");

const rootKind = new Int8Array(N);
for (let i = 0; i < N; i++) {
  if (g.postIndex[i] < 0) continue;
  if (g.type[i] === T_CODE) {
    for (let k = g.firstEdge[i]; k < g.firstEdge[i + 1]; k++) {
      if (g.edges[k * g.EF + 1] === I_SOURCE && g.edgeType(k) === "internal") rootKind[g.edgeTarget(k)] = 1;
    }
  }
  if (g.type[i] === T_OBJECT) {
    if (g.name[i] === I_LRU) rootKind[i] = 2;
    const props = [];
    for (let k = g.firstEdge[i]; k < g.firstEdge[i + 1] && props.length < 8; k++) if (g.edgeType(k) === "property") props.push(g.edgeLabel(k));
    if (props.includes("version") && props.includes("generatedAt") && props.includes("languages")) rootKind[i] = 3;
    if (g.name[i] === I_MODULE && props.includes("getHeritageMapData")) rootKind[i] = 4;
  }
}

const cat = new Int8Array(N);
const total = new Float64Array(names.length);
const byType = names.map(() => ({}));
for (let r = R - 1; r >= 0; r--) {
  const i = g.order[r];
  const c = rootKind[i] ? rootKind[i] : r === R - 1 ? 0 : cat[g.order[g.dom[r]]];
  cat[i] = c;
  total[c] += g.self[i];
  const t = g.typeName(i);
  byType[c][t] = (byType[c][t] || 0) + g.self[i];
}
const MB = 1048576;
console.log("| holder | MB | by node type (MB) |\n|---|---:|---|");
for (let c = 0; c < names.length; c++) {
  const top = Object.entries(byType[c])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k} ${(v / MB).toFixed(1)}`)
    .join(", ");
  console.log(`| ${names[c]} | ${(total[c] / MB).toFixed(1)} | ${top} |`);
}
console.log(`| **total reachable** | ${(total.reduce((a, b) => a + b, 0) / MB).toFixed(1)} | |`);
