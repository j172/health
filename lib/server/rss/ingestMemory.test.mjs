// The whole RSS ingestion (runRssIngestion, the real one) against a synthetic world, in a child process (issue #699).
//
// Production background: health-web is SIGKILLed by the shared host about three minutes into an ingestion run, and
// an ingestion starts every ~15 minutes (the in-app cron at :05/:35 and the GitHub heartbeat through the admin route
// at :20/:50), so the process never gets to finish one. Measured on this harness (scripts/measure-rss-ingestion-
// memory.mjs; numbers are in the PR): the old pipeline needed ~580 MB of V8 heap for the page-heavy scenario below
// and dies under a 80 MB cap with "JavaScript heap out of memory"; the fixed one peaks at ~45 MB.
//
// Only the outside edges are replaced (see testSupport/ingestStubs.mjs): the network is a local server, the database
// an in-memory model with a real named lock, the ~50 per-publisher scrapers a common stand-in. Everything between —
// httpClient, feed parsing, freshness, detail pages, og:image, image download, SEO, persistence, the lock — is real.
import test from "node:test";
import assert from "node:assert/strict";
import { runIngestChild } from "./testSupport/ingestRunner.mjs";
import { listSpecialSourceImports } from "./testSupport/ingestStubs.mjs";

const SPECIAL_SOURCE_COUNT = listSpecialSourceImports().reduce((sum, entry) => sum + entry.names.length, 0);

/** Pages that are 1.5 MB and no <enclosure> images, so every item has to find its card image on the article page. */
const PAGE_HEAVY_WORLD = { enclosures: false, articleKB: 1500, feedItems: 10, listingKB: 100 };
const CHILD_HEAP_MB = 80;

const run = async (options) => {
  const outcome = await runIngestChild({ timeoutMs: 240_000, ...options });
  assert.ok(
    outcome.result,
    `child exited ${outcome.status} (signal ${outcome.signal}) under --max-old-space-size=${options.heapMb ?? 768}:\n${outcome.stderr.slice(0, 1200)}\n${outcome.stdout}`,
  );
  return outcome;
};

test(`a page-heavy ingestion (1.5 MB articles, no feed images) completes inside a ${CHILD_HEAP_MB} MB V8 heap, then runs again as all-unchanged`, { timeout: 300_000 }, async () => {
  const feeds = 12;
  const specialItems = 2;
  const { result, world } = await run({
    world: PAGE_HEAVY_WORLD,
    heapMb: CHILD_HEAP_MB,
    child: { runs: ["cold", "warm"], feedLimit: feeds, special: { items: specialItems }, keepStageLines: true },
  });
  const [cold, warm] = result.runs;
  const expectedItems = feeds * PAGE_HEAVY_WORLD.feedItems + SPECIAL_SOURCE_COUNT * specialItems;

  assert.equal(cold.error, null);
  assert.equal(cold.summary.fetched, expectedItems);
  assert.equal(cold.summary.inserted, expectedItems, "every item is new on the first run");
  assert.equal(cold.summary.failedFeeds, 0);
  assert.equal(warm.error, null);
  assert.equal(warm.summary.unchanged, expectedItems, "what the first run stored is recognised as unchanged");
  assert.equal(warm.summary.inserted, 0);

  // the article pages really were read, but only their start: the world serves 1.5 MB pages
  assert.ok(world.articles >= feeds * PAGE_HEAVY_WORLD.feedItems * 0.5, `only ${world.articles} article pages were requested`);

  // ...and a run row went running -> success, with nothing left behind
  assert.deepEqual(result.db.runs.map((r) => [r.trigger, r.status]), [["admin-manual", "success"], ["admin-manual", "success"]]);
});

test("every unit of work writes one JSON stage line with the heap and RSS, bracketed by run_start and run_end", { timeout: 300_000 }, async () => {
  const feeds = 6;
  const { result } = await run({
    world: { listingKB: 40 },
    child: { runs: ["cold"], feedLimit: feeds, special: { items: 1 }, keepStageLines: true },
  });
  const lines = result.runs[0].stageLines;
  const stages = lines.map((l) => l.stage);

  assert.equal(stages[0], "run_start");
  assert.equal(stages.at(-1), "run_end");
  assert.equal(stages.filter((s) => s === "feed_done").length, feeds);
  assert.equal(stages.filter((s) => s === "source_done").length, SPECIAL_SOURCE_COUNT);
  assert.equal(lines[0].feeds, feeds);

  for (const line of lines) {
    assert.equal(line.event, "rss_ingestion_stage");
    assert.equal(typeof line.runId, "number");
    assert.equal(line.trigger, "admin-manual");
    assert.ok(line.heapUsedMB > 0 && line.rssMB >= line.heapUsedMB && line.externalMB >= 0, JSON.stringify(line));
  }
  const elapsed = lines.map((l) => l.elapsedMs);
  assert.deepEqual(elapsed, [...elapsed].sort((a, b) => a - b), "elapsedMs never goes backwards");

  const firstFeed = lines.find((l) => l.stage === "feed_done");
  assert.deepEqual(Object.keys(firstFeed).filter((k) => ["feed", "items", "fresh", "stale", "unchanged", "enriched", "ok"].includes(k)).sort(), [
    "enriched",
    "feed",
    "fresh",
    "items",
    "ok",
    "stale",
    "unchanged",
  ]);
  const last = lines.at(-1);
  assert.equal(last.status, "success");
  assert.equal(last.fetched, result.runs[0].summary.fetched);
});

test("the run hands the event loop back between items (a setImmediate per item), so requests and probes are served mid-run", { timeout: 300_000 }, async () => {
  const feeds = 6;
  const { result } = await run({
    world: { listingKB: 40 },
    child: { runs: ["cold"], feedLimit: feeds, special: { items: 2 } },
  });
  const cold = result.runs[0];
  // one tick per fresh item + one checkpoint per unit; the stub database also answers through setImmediate
  assert.ok(cold.immediateCalls >= cold.summary.fetched, `${cold.immediateCalls} hand-backs for ${cold.summary.fetched} items`);
});

test("two triggers at once: the lock lets exactly one ingestion run, and the other is a quiet 'skipped' row, not a failure", { timeout: 300_000 }, async () => {
  for (const first of ["internal-cron", "admin-manual"]) {
    const { result } = await run({
      world: { listingKB: 40 },
      child: { runs: ["overlap"], overlapFirst: first, feedLimit: 3, special: { items: 1 } },
    });
    const overlap = result.runs[0];
    const second = first === "internal-cron" ? "admin-manual" : "internal-cron";

    assert.equal(overlap.error, null);
    assert.equal(overlap.attempts.length, 2);
    assert.ok(overlap.attempts.every((a) => !a.error), "neither attempt throws: a skipped trigger is not an error");

    const winner = overlap.attempts.find((a) => a.skipped === null);
    const skipped = overlap.attempts.find((a) => a.skipped === "lock_held");
    assert.equal(winner.trigger, first, "whoever asked first holds the lock — the same lock for both entry points");
    assert.ok(winner.fetched > 0);
    assert.equal(skipped.trigger, second);
    assert.equal(skipped.fetched, 0);
    assert.equal(skipped.failedFeeds, 0, "a skip does not count as a failed feed");

    assert.deepEqual(
      result.db.runs.map((r) => [r.trigger, r.status]).sort(),
      [[first, "success"], [second, "skipped"]].sort(),
      "one success, one skipped — never 'failed', never a stuck 'running'",
    );
    assert.equal(result.db.errors, 0, "nothing was written to ingest_errors for the skip");
  }
});

test("a lock that disappears mid-run (the database dropped the connection holding it) stops the run at the next checkpoint", { timeout: 300_000 }, async () => {
  const { result } = await run({
    world: { listingKB: 40 },
    child: { runs: ["cold"], feedLimit: 8, special: { items: 1 }, dropLockAfterFeeds: 2, keepStageLines: true },
  });
  const cold = result.runs[0];

  assert.match(cold.error, /no longer held/, "the run reports why it stopped");
  const stages = cold.stageLines.map((l) => l.stage);
  assert.ok(stages.filter((s) => s === "feed_done").length <= 3, "it did not carry on through the remaining feeds");
  assert.ok(!stages.includes("source_done"), "and never reached the special sources");
  assert.ok(stages.includes("run_failed"));

  const [row] = result.db.runs;
  assert.equal(row.status, "failed", "the row leaves 'running' even though the run was cut short");
  assert.match(row.errorMessage, /no longer held/);
});
