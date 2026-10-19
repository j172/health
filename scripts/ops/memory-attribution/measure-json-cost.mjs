#!/usr/bin/env node
/**
 * Stand-alone cost of the big bundled JSON seeds (issue #709), without Next:
 *   heap of the raw text as a JS string (what a chunk's source keeps resident)
 *   heap of the parsed object graph (what JSON.parse leaves behind)
 *
 *   node --expose-gc measure-json-cost.mjs --repo <repo root> [--files a.json,b.json]
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
if (typeof global.gc !== "function") {
  console.error("run with: node --expose-gc measure-json-cost.mjs ...");
  process.exit(2);
}
const repo = path.resolve(opt("repo", "."));
const files = (opt("files") || "data/child-native-languages-seed.json,data/public-art.json,lib/server/news/data/cedict-terms.json,data/heritage-map-seed.json,data/breastfeeding-rooms-seed.json,data/cultural-events-seed.json,data/youbike-stations-seed.json,data/performance-venues-seed.json,data/contraception-map-seed.json,data/latest-books-seed.json").split(",");
const MB = 1048576;
const heap = () => {
  global.gc();
  global.gc();
  return process.memoryUsage().heapUsed;
};

console.log(`node ${process.version}`);
console.log("| file | file MB | text in heap MB | parsed graph MB | text+graph MB |");
console.log("|---|---:|---:|---:|---:|");
for (const rel of files) {
  const p = path.join(repo, rel);
  if (!fs.existsSync(p)) {
    console.log(`| ${rel} | missing | | | |`);
    continue;
  }
  const size = fs.statSync(p).size;
  const h0 = heap();
  let text = fs.readFileSync(p, "utf8");
  // force a flat string (a Buffer->string conversion is already flat, this just makes sure)
  const hText = heap();
  let obj = JSON.parse(text);
  const hBoth = heap();
  text = null;
  const hParsed = heap();
  console.log(`| ${rel} | ${(size / MB).toFixed(1)} | ${((hText - h0) / MB).toFixed(1)} | ${((hParsed - h0) / MB).toFixed(1)} | ${((hBoth - h0) / MB).toFixed(1)} |`);
  obj = null;
  heap();
}
