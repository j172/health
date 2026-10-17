#!/usr/bin/env node
// Measures how much memory one RSS ingestion run needs, WITHOUT touching any real publisher or the production
// site: the real runRssIngestion() runs in a child process against a local synthetic world (see
// lib/server/rss/testSupport/). Used to produce the before/after numbers in the issue #699 fix.
//
//   node scripts/measure-rss-ingestion-memory.mjs
//   node scripts/measure-rss-ingestion-memory.mjs --feeds 52 --runs cold,warm --heap 768 --churn 0.1
//   node scripts/measure-rss-ingestion-memory.mjs --world articleKB=900,imageKB=400 --json
//
// Options (all optional):
//   --feeds N         how many of the real RSS_FEEDS to walk (default 52 = all)
//   --runs a,b        cold = nothing stored yet (every fresh item enriched), warm = what the last run stored is unchanged
//   --heap MB         --max-old-space-size of the child (default 768, production's)
//   --special N       items per special-source stand-in (default 15)
//   --churn F         fraction of items whose text changes between runs (default 0)
//   --latency MS      server-side delay per request (a network round trip; production's run is ~7,000 requests in ~11 min)
//   --ballast MB      live heap the child holds, like the Next.js server's ~250-300 MB (V8 collects less often on a big heap)
//   --world k=v,...   any stubWorld option (feedItems, articleKB, govArticleKB, imageKB, bigImageEvery, bigImageKB, ...)
//   --tls             serve the world over HTTPS (needs `openssl`) so the cost of TLS handshakes is part of the measurement —
//                     without it every request is plain HTTP and the per-connection SecureContext memory is invisible
//   --trace-gc        pass --trace-gc to the child (very chatty; stderr is kept)
//   --json            print the raw result instead of the table
import { runIngestChild } from "../lib/server/rss/testSupport/ingestRunner.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const world = {};
for (const pair of String(flag("world", "")).split(",").filter(Boolean)) {
  const [key, value] = pair.split("=");
  world[key] = Number.isNaN(Number(value)) ? value : Number(value);
}
if (flag("churn")) world.churn = Number(flag("churn"));
if (flag("latency")) world.latencyMs = Number(flag("latency"));

const outcome = await runIngestChild({
  world,
  heapMb: Number(flag("heap", 768)),
  tls: has("tls"),
  nodeArgs: has("trace-gc") ? ["--trace-gc"] : [],
  child: {
    runs: String(flag("runs", "cold,warm")).split(","),
    feedLimit: flag("feeds") ? Number(flag("feeds")) : undefined,
    special: { items: Number(flag("special", 15)) },
    ballastMb: Number(flag("ballast", 0)),
  },
  timeoutMs: 20 * 60_000,
});

if (!outcome.result) {
  console.error(`child exited ${outcome.status} (signal ${outcome.signal})\n${outcome.stderr}\n${outcome.stdout}`);
  process.exit(1);
}
if (has("json")) {
  console.log(JSON.stringify(outcome, null, 2));
  process.exit(0);
}

console.log(`world requests: ${outcome.world.requests} over ${outcome.world.connections} connections (feeds ${outcome.world.feeds}, articles ${outcome.world.articles}, images ${outcome.world.images}, ai ${outcome.world.ai})`);
console.log("run   duration   baseline RSS   peak RSS   +peak    base heap  peak heap   peak external   max loop lag   stages  fetched/inserted/unchanged");
for (const run of outcome.result.runs) {
  const s = run.summary;
  console.log(
    [
      run.name.padEnd(5),
      `${(run.durationMs / 1000).toFixed(1)}s`.padStart(8),
      `${run.baselineRssMb} MB`.padStart(13),
      `${run.peakRssMb} MB`.padStart(10),
      `+${run.peakRssDeltaMb}`.padStart(8),
      `${run.baselineHeapMb} MB`.padStart(10),
      `${run.peakHeapMb} MB`.padStart(11),
      `${run.peakExternalMb} MB`.padStart(15),
      `${run.maxLagMs} ms`.padStart(13),
      String(run.stages).padStart(8),
      s ? `  ${s.fetched}/${s.inserted}/${s.unchanged}${s.skipped ? ` skipped=${s.skipped}` : ""}` : `  ERROR ${run.error}`,
    ].join("  "),
  );
}
console.log(`process maxRSS: ${outcome.result.maxRssMb} MB`);
