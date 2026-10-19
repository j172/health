#!/usr/bin/env node
/**
 * Diffs two JSON reports written by analyze-heapsnapshot.mjs (--json), e.g.
 * variant A minus variant B (= the resident cost of the cron job graph), or a
 * later snapshot minus an earlier one.
 *
 *   node compare-reports.mjs <A.json> <B.json> [--top 25] [--md out.md]
 *
 * Prints A - B (MB) for: node types, script groups, source text per module,
 * ownership groups. Positive = A holds more.
 */
import fs from "node:fs";

const argv = process.argv.slice(2);
const files = argv.filter((a) => !a.startsWith("--") && fs.existsSync(a));
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const TOP = Number(opt("top", 25));
if (files.length < 2) {
  console.error("usage: compare-reports.mjs <A.json> <B.json> [--top 25] [--md out.md]");
  process.exit(2);
}
const a = JSON.parse(fs.readFileSync(files[0], "utf8"));
const b = JSON.parse(fs.readFileSync(files[1], "utf8"));
const out = [];

const diffMap = (title, ma, mb, label) => {
  const keys = new Set([...Object.keys(ma || {}), ...Object.keys(mb || {})]);
  const rows = [...keys].map((k) => ({ k, a: ma?.[k] || 0, b: mb?.[k] || 0, d: (ma?.[k] || 0) - (mb?.[k] || 0) }));
  rows.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  out.push(`\n### ${title}\n`);
  out.push(`| ${label} | A MB | B MB | A - B MB |\n|---|---:|---:|---:|`);
  for (const r of rows.slice(0, TOP)) if (Math.abs(r.d) >= 0.05) out.push(`| ${r.k.replace(/\|/g, "\\|").slice(0, 80)} | ${r.a.toFixed(1)} | ${r.b.toFixed(1)} | ${r.d >= 0 ? "+" : ""}${r.d.toFixed(1)} |`);
};
const asMap = (arr, keyF) => Object.fromEntries((arr || []).map((x) => [keyF(x), x.MB]));

out.push(`## ${files[0].split(/[\\/]/).pop()} minus ${files[1].split(/[\\/]/).pop()}`);
out.push(`\nreachable heap: A ${a.reachableMB.toFixed(1)} MB, B ${b.reachableMB.toFixed(1)} MB, difference ${(a.reachableMB - b.reachableMB).toFixed(1)} MB`);
diffMap("By V8 node type", a.byType, b.byType, "type");
diffMap("Script groups (source text of loaded files)", a.scriptGroups, b.scriptGroups, "group");
diffMap("Source text per original module", asMap(a.modules, (x) => x.module), asMap(b.modules, (x) => x.module), "module");
diffMap("Source text grouped", a.moduleGroups, b.moduleGroups, "group");
diffMap("Ownership groups (whole heap)", a.owners, b.owners, "owner group");
diffMap("Ownership modules (whole heap)", asMap(a.ownerModules, (x) => x.owner), asMap(b.ownerModules, (x) => x.owner), "owner");
diffMap("Strings", a.strings, b.strings, "kind");

const text = out.join("\n") + "\n";
if (opt("md")) fs.writeFileSync(opt("md"), text);
else console.log(text);
