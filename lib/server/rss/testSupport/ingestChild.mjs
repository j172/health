// Child-process entry: runs the real runRssIngestion() (stubbed edges, see ingestStubs.mjs) one or more
// times and reports, per run, how much memory it needed. NOT a test itself.
//
//   RSS_INGEST_CHILD_CONFIG='{"port":1234,"runs":["cold","warm"],"feedLimit":12}' \
//     node --max-old-space-size=768 ingestChild.mjs
//
// Memory is read from process.memoryUsage() every SAMPLE_MS and at every stage-log line the ingestion writes,
// so a peak that lasts longer than a sample is never missed; `maxLagMs` is the longest the event loop went
// without servicing the sampler timer (a synchronous stretch of that length starved every other request).
// Prints one line `RESULT:<json>` on stdout when done.
import { installIngestStubs } from "./ingestStubs.mjs";
import { repoRootUrl } from "../../garbageRoutes/testSupport/repoHooks.mjs";

const config = JSON.parse(process.env.RSS_INGEST_CHILD_CONFIG ?? "{}");
const state = installIngestStubs(config);
const SAMPLE_MS = config.sampleMs ?? 20;
const toMb = (bytes) => Math.round((bytes / 1048576) * 10) / 10;

// ---- observe -------------------------------------------------------------------------------------------------
let immediateCalls = 0;
const realSetImmediate = globalThis.setImmediate;
globalThis.setImmediate = (...args) => {
  immediateCalls += 1;
  return realSetImmediate(...args);
};

const stageLines = [];
const otherLines = [];
let lastStage = null;
let feedsDone = 0;
const keep = (line) => {
  const text = String(line);
  if (text.startsWith('{"event":"rss_ingestion_stage"')) {
    const entry = JSON.parse(text);
    stageLines.push(entry);
    lastStage = `${entry.stage}:${entry.feed ?? entry.source ?? ""}`;
    // Simulates the database dropping the connection that holds the advisory lock (wait_timeout, a restart): the
    // lock simply ceases to exist, and the next heartbeat has to notice.
    if (config.dropLockAfterFeeds && entry.stage === "feed_done" && ++feedsDone === config.dropLockAfterFeeds) {
      state.db.locks.clear();
    }
  } else if (otherLines.length < 200) otherLines.push(text.slice(0, 300));
};
console.log = keep;
console.info = keep;
console.warn = keep;
console.error = keep;

const readMem = () => {
  const m = process.memoryUsage();
  return { rss: m.rss, heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers };
};

const tracker = {
  peak: readMem(),
  maxLagMs: 0,
  lastTick: performance.now(),
  series: [],
  reset() {
    this.peak = readMem();
    this.maxLagMs = 0;
    this.lastTick = performance.now();
    this.series = [];
    this.lagEvents = [];
  },
  lagEvents: [],
  sample() {
    const now = performance.now();
    const lag = now - this.lastTick - SAMPLE_MS;
    if (lag > 400 && this.lagEvents.length < 20) this.lagEvents.push({ lagMs: Math.round(lag), afterStage: lastStage });
    this.maxLagMs = Math.max(this.maxLagMs, lag);
    this.lastTick = now;
    const m = readMem();
    for (const key of Object.keys(m)) this.peak[key] = Math.max(this.peak[key], m[key]);
    if (this.series.length < 4000) this.series.push([Math.round(now), toMb(m.rss), toMb(m.heapUsed)]);
  },
};
const timer = setInterval(() => tracker.sample(), SAMPLE_MS);
timer.unref?.();

// ---- run -------------------------------------------------------------------------------------------------------
const { runRssIngestion } = await import(new URL("lib/server/rss/runIngestion.ts", repoRootUrl).href);

const gc = globalThis.gc;

// Production's heap is not empty: the Next.js server keeps ~250-300 MB of live objects. That matters because V8 sets
// its next full-collection threshold relative to the LIVE size, so on a big heap garbage piles up far longer before
// anything is collected than it does in a bare child. `ballastMb` recreates that: long-lived small objects, held for
// the life of the process, followed by two collections so V8 settles its thresholds around them.
const ballast = [];
if (config.ballastMb) {
  const perObject = 150; // bytes, roughly: an object, a short string and a one-element array
  for (let i = 0; i < (config.ballastMb * 1048576) / perObject; i += 1) {
    ballast.push({ id: i, name: `route-${i}-`.padEnd(40, "x"), tags: [i] });
  }
  globalThis.__ballast = ballast; // reachable from a global, so it is genuinely live for the whole run
  gc?.();
  gc?.();
}

const results = [];
const names = config.runs ?? ["cold"];
for (const name of names) {
  if (name === "warm" || name === "cold") {
    // cold: nothing stored yet (every fresh item is "new"); warm: whatever the previous run stored counts as unchanged.
    if (name === "cold") {
      state.db.hashes.clear();
      state.db.persisted = 0;
    }
  }
  gc?.();
  const baseline = readMem();
  tracker.reset();
  stageLines.length = 0;
  immediateCalls = 0;
  const startedAt = performance.now();
  let summary = null;
  let error = null;
  let attempts = null;
  try {
    if (name === "overlap") {
      // The two triggers of production (the in-app cron and the GitHub heartbeat through the admin route) firing together.
      const order = config.overlapFirst === "admin-manual" ? ["admin-manual", "internal-cron"] : ["internal-cron", "admin-manual"];
      const settled = await Promise.allSettled(order.map((trigger) => runRssIngestion(trigger)));
      attempts = settled.map((outcome) =>
        outcome.status === "fulfilled"
          ? { trigger: outcome.value.trigger, runId: outcome.value.runId, skipped: outcome.value.skipped ?? null, fetched: outcome.value.fetched, failedFeeds: outcome.value.failedFeeds }
          : { error: String(outcome.reason?.message ?? outcome.reason) },
      );
    } else {
      summary = await runRssIngestion(config.trigger ?? "admin-manual");
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  tracker.sample();
  const durationMs = Math.round(performance.now() - startedAt);
  const stageRss = stageLines.map((l) => l.rssMB);
  const peakRssMb = Math.max(toMb(tracker.peak.rss), ...stageRss.map((v) => v ?? 0));
  results.push({
    name,
    durationMs,
    error,
    attempts,
    summary: summary && {
      runId: summary.runId,
      skipped: summary.skipped ?? null,
      fetched: summary.fetched,
      inserted: summary.inserted,
      updated: summary.updated,
      unchanged: summary.unchanged,
      staleRejected: summary.staleRejected,
      failedFeeds: summary.failedFeeds,
    },
    baselineRssMb: toMb(baseline.rss),
    baselineHeapMb: toMb(baseline.heapUsed),
    peakRssMb,
    peakRssDeltaMb: Math.round((peakRssMb - toMb(baseline.rss)) * 10) / 10,
    peakHeapMb: toMb(tracker.peak.heapUsed),
    peakExternalMb: toMb(tracker.peak.external),
    peakArrayBuffersMb: toMb(tracker.peak.arrayBuffers),
    maxLagMs: Math.round(tracker.maxLagMs * 10) / 10,
    lagEvents: tracker.lagEvents,
    immediateCalls,
    stages: stageLines.length,
    stageLines: config.keepStageLines ? stageLines.slice() : undefined,
    series: config.keepSeries ? tracker.series : undefined,
  });
}

process.stdout.write(
  `RESULT:${JSON.stringify({
    runs: results,
    maxRssMb: Math.round((process.resourceUsage().maxRSS / 1024) * 10) / 10,
    db: {
      runs: [...state.db.runs.values()],
      errors: state.db.errors.length,
      persisted: state.db.persisted,
      queries: state.db.queries,
      counts: state.db.counts,
    },
    otherLines: otherLines.slice(0, 20),
  })}\n`,
);
