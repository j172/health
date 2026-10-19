#!/usr/bin/env node
/**
 * Turns the samples.csv files written by mem-preload.cjs into markdown tables
 * (issue #709): one row per time point, one column per instance.
 *
 * Usage: node summarize-series.mjs --out-root <matrix>/out [--names A-long,B-long,...]
 *          [--times 3,30,60,300,600,900,1200,1800,3600,5400,7200] [--json result.json]
 *
 * A value is the sample whose uptime_s is closest to the requested time (the
 * sampler writes every 1 s for the first minute, every 5 s afterwards). "med"
 * rows are the median over the last 10 minutes of each instance's series.
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
// --out-root accepts several comma-separated roots (e.g. the main matrix and the what-if matrix);
// an instance name is looked up in each root in order.
const roots = (opt("out-root", "") || "").split(",").map((r) => path.resolve(r));
const dirOf = (n) => roots.map((r) => path.join(r, n)).find((d) => fs.existsSync(path.join(d, "samples.csv")));
const times = (opt("times", "3,30,60,300,600,900,1200,1800,3600,5400,7200") || "").split(",").map(Number);
const names = opt("names")
  ? opt("names").split(",")
  : [...new Set(roots.flatMap((r) => fs.readdirSync(r)))].filter((n) => dirOf(n)).sort();
const MB = 1048576;

const readCsv = (file) => {
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => {
    const cells = l.split(",");
    const row = {};
    head.forEach((h, i) => (row[h] = h === "iso" ? cells[i] : Number(cells[i])));
    return row;
  });
};

const series = {};
for (const n of names) series[n] = readCsv(path.join(dirOf(n), "samples.csv"));

const nearest = (rows, t) => {
  let best = null;
  for (const r of rows) if (best === null || Math.abs(r.uptime_s - t) < Math.abs(best.uptime_s - t)) best = r;
  return best && Math.abs(best.uptime_s - t) <= Math.max(6, t * 0.02) ? best : null;
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const fmt = (v) => (v === null || v === undefined || Number.isNaN(v) ? "-" : (v / MB).toFixed(0));

const out = {};
const md = [];
for (const [metric, label] of [
  ["rss", "RSS (Windows working set), MB"],
  ["heapUsed", "heapUsed, MB"],
  ["heapTotal", "heapTotal, MB"],
  ["external", "external, MB"],
  ["arrayBuffers", "arrayBuffers, MB"],
]) {
  md.push(`\n#### ${label}\n`);
  md.push(`| t | ${names.join(" | ")} |`);
  md.push(`|---|${names.map(() => "---:").join("|")}|`);
  out[metric] = {};
  for (const t of times) {
    const cells = names.map((n) => {
      const r = nearest(series[n], t);
      out[metric][`${n}@${t}`] = r ? r[metric] / MB : null;
      return fmt(r ? r[metric] : null);
    });
    if (cells.every((c) => c === "-")) continue;
    md.push(`| ${t < 120 ? `${t} s` : `${(t / 60).toFixed(t % 60 ? 1 : 0)} min`} | ${cells.join(" | ")} |`);
  }
  const medCells = names.map((n) => {
    const rows = series[n];
    if (!rows.length) return "-";
    const end = rows[rows.length - 1].uptime_s;
    const tail = rows.filter((r) => r.uptime_s >= end - 600).map((r) => r[metric]);
    out[metric][`${n}@median-last10min`] = median(tail) / MB;
    return fmt(median(tail));
  });
  md.push(`| med last 10 min | ${medCells.join(" | ")} |`);
}

// where the RSS goes: V8 spaces + malloc at chosen times (default: the last time point that has data)
const spaceTimes = (opt("space-times", "300,1700") || "").split(",").map(Number);
md.push(`\n#### V8 spaces and native memory (MB)\n`);
md.push(`| instance | t | RSS | heapTotal | old | new | code | large-object | external | malloced | RSS - heapTotal - external |`);
md.push(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
for (const n of names) {
  for (const t of spaceTimes) {
    const r = nearest(series[n], t);
    if (!r) continue;
    const m = (k) => (r[k] / MB).toFixed(0);
    md.push(`| ${n} | ${t} s | ${m("rss")} | ${m("heapTotal")} | ${m("old_space_size")} | ${m("new_space_size")} | ${m("code_space_size")} | ${(((r.large_object_space_size || 0) + (r.code_large_object_space_size || 0)) / MB).toFixed(0)} | ${m("external")} | ${m("malloced_memory")} | ${((r.rss - r.heapTotal - r.external) / MB).toFixed(0)} |`);
  }
}

// distribution inside a window (default 30 min .. end): single points are noisy because of GC cycles
const win = (opt("window", "1800,99999") || "").split(",").map(Number);
md.push(`\n#### distribution of samples between ${win[0]} s and ${win[1]} s (MB)\n`);
md.push(`| instance | samples | RSS min / p10 / median / p90 / max | heapUsed min / p10 / median / p90 / max |`);
md.push(`|---|---:|---|---|`);
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};
for (const n of names) {
  const rows = series[n].filter((r) => r.uptime_s >= win[0] && r.uptime_s <= win[1]);
  if (!rows.length) continue;
  const f = (k) => [0, 0.1, 0.5, 0.9, 1].map((p) => (pct(rows.map((r) => r[k]), p === 1 ? 0.999999 : p) / MB).toFixed(0)).join(" / ");
  md.push(`| ${n} | ${rows.length} | ${f("rss")} | ${f("heapUsed")} |`);
}

md.push(`\n#### peak (maxRSS, working-set peak), MB\n`);
md.push(`| instance | maxRSS | last sample uptime |`);
md.push(`|---|---:|---:|`);
for (const n of names) {
  const rows = series[n];
  const peak = Math.max(...rows.map((r) => r.maxRssKb || 0)) / 1024;
  out[`peak@${n}`] = peak;
  md.push(`| ${n} | ${peak.toFixed(0)} | ${rows.length ? rows[rows.length - 1].uptime_s.toFixed(0) : "-"} s |`);
}

console.log(md.join("\n"));
if (opt("json")) fs.writeFileSync(opt("json"), JSON.stringify(out, null, 2));
