// Unit tests for the ingestion freshness gate (issue #92) — run with `npm test`.
//
// Same setup as fetchDetailPage.test.mjs / fetchPhase15Sources.test.mjs:
// node:test + node:assert only, no framework. The "@/" alias and the
// `server-only` stub are needed because fetchTascTaiwanNews.ts (whose
// parseDateFromTitle is exercised below) reaches the http client and the image
// downloader through the app graph. Neither is called here — only the pure
// date parser is — but they still have to resolve for the module to load.
//
// `now` is passed explicitly to every assertion. A gate keyed off the wall
// clock would be a test that changes its mind overnight, and the boundaries
// (89 vs 91 days, a date in the future) are exactly where that would bite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const {
  evaluateFreshness,
  isFresh,
  partitionByFreshness,
  FRESHNESS_WINDOW_DAYS,
  FUTURE_TOLERANCE_MS,
} = await import("./freshness.ts");
const { parseDateFromTitle } = await import("./fetchTascTaiwanNews.ts");
const { RSS_FEEDS } = await import("../config/rss-feeds.ts");

const NOW = new Date("2026-08-31T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysBefore = (days) => new Date(NOW.getTime() - days * DAY_MS);
const daysAfter = (days) => new Date(NOW.getTime() + days * DAY_MS);

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

test("the window is 90 days", () => {
  assert.equal(FRESHNESS_WINDOW_DAYS, 90);
});

test("89 days old passes", () => {
  const verdict = evaluateFreshness({ publishedAtUtc: daysBefore(89) }, NOW);
  assert.equal(verdict.fresh, true);
  assert.equal(verdict.reason, "fresh");
  assert.equal(Math.round(verdict.ageDays), 89);
});

test("91 days old is rejected as too old", () => {
  const verdict = evaluateFreshness({ publishedAtUtc: daysBefore(91) }, NOW);
  assert.equal(verdict.fresh, false);
  assert.equal(verdict.reason, "too-old");
  assert.equal(Math.round(verdict.ageDays), 91);
});

test("exactly 90 days old is still inside the window", () => {
  assert.equal(isFresh({ publishedAtUtc: daysBefore(90) }, NOW), true);
});

test("the years-old junk from a Google site: feed is rejected", () => {
  // ntuh_news' median item is 1767 days old — a 掛號服務 page, not news.
  assert.equal(isFresh({ publishedAtUtc: daysBefore(1767) }, NOW), false);
});

// ---------------------------------------------------------------------------
// Future dates
//
// The case that motivated the ticket. A naive `now - published > window` check
// scores a future date as *negative* days old and waves it through as the
// freshest item in the run, which is how a course announcement ended up pinned
// to the top of a newest-first /news.
// ---------------------------------------------------------------------------

test("a date five days in the future is rejected AS a future date", () => {
  const verdict = evaluateFreshness({ publishedAtUtc: daysAfter(5) }, NOW);
  assert.equal(verdict.fresh, false);
  assert.equal(verdict.reason, "future-dated");
  assert.ok(verdict.ageDays < 0, "a future item has a negative age");
});

test("a date a year in the future is rejected, not treated as very fresh", () => {
  const verdict = evaluateFreshness({ publishedAtUtc: daysAfter(365) }, NOW);
  assert.equal(verdict.fresh, false);
  assert.notEqual(verdict.reason, "fresh");
  assert.equal(verdict.reason, "future-dated");
});

test("a small clock skew ahead of now is tolerated, not rejected", () => {
  // Publishers routinely stamp +08:00 local time as if it were UTC. Rejecting
  // that would drop genuinely brand-new articles.
  const skewed = new Date(NOW.getTime() + FUTURE_TOLERANCE_MS - 1000);
  assert.equal(isFresh({ publishedAtUtc: skewed }, NOW), true);
});

// ---------------------------------------------------------------------------
// The first-seen fallback — what makes the gate work for the eight fetchers
// that hardcode publishedAtUtc: null without fixing them first.
// ---------------------------------------------------------------------------

test("a null publishedAtUtc falls back to first-seen", () => {
  const verdict = evaluateFreshness(
    { publishedAtUtc: null, firstSeenAtUtc: daysBefore(10) },
    NOW,
  );
  assert.equal(verdict.fresh, true);
  assert.equal(verdict.effectiveDate.getTime(), daysBefore(10).getTime());
});

test("a null publishedAtUtc with an old first-seen reads as old", () => {
  const verdict = evaluateFreshness(
    { publishedAtUtc: null, firstSeenAtUtc: daysBefore(200) },
    NOW,
  );
  assert.equal(verdict.fresh, false);
  assert.equal(verdict.reason, "too-old");
});

test("an item with neither date is treated as first seen now, so it passes", () => {
  // At ingestion an item is not in the table yet; persistItems writes
  // first_seen_at_utc = now on insert, so "no dates at all" means "new".
  const verdict = evaluateFreshness({ publishedAtUtc: null }, NOW);
  assert.equal(verdict.fresh, true);
  assert.equal(verdict.effectiveDate.getTime(), NOW.getTime());
});

test("publishedAtUtc wins over first-seen when both are present", () => {
  const verdict = evaluateFreshness(
    { publishedAtUtc: daysBefore(400), firstSeenAtUtc: daysBefore(1) },
    NOW,
  );
  assert.equal(verdict.fresh, false);
  assert.equal(verdict.reason, "too-old");
});

test("an unparseable Date is ignored rather than poisoning the verdict", () => {
  const verdict = evaluateFreshness(
    { publishedAtUtc: new Date("nonsense"), firstSeenAtUtc: daysBefore(3) },
    NOW,
  );
  assert.equal(verdict.fresh, true);
  assert.equal(verdict.effectiveDate.getTime(), daysBefore(3).getTime());
});

// ---------------------------------------------------------------------------
// partitionByFreshness — what runIngestion actually calls
// ---------------------------------------------------------------------------

test("partitionByFreshness keeps the fresh half and reports the rest", () => {
  const items = [
    { id: "fresh", publishedAtUtc: daysBefore(1) },
    { id: "old", publishedAtUtc: daysBefore(900) },
    { id: "future", publishedAtUtc: daysAfter(5) },
    { id: "undated", publishedAtUtc: null },
  ];
  const { fresh, rejected } = partitionByFreshness(items, NOW);

  assert.deepEqual(
    fresh.map((item) => item.id),
    ["fresh", "undated"],
  );
  assert.deepEqual(
    rejected.map((entry) => [entry.item.id, entry.verdict.reason]),
    [
      ["old", "too-old"],
      ["future", "future-dated"],
    ],
  );
});

// ---------------------------------------------------------------------------
// parseDateFromTitle — 台灣性諮商學會's titles carry an EVENT date
// ---------------------------------------------------------------------------

test("parseDateFromTitle parses a past date out of a title", () => {
  const parsed = parseDateFromTitle(
    "2026.05.10(六)《當身體遇見社會：性諮商工作坊》",
    NOW,
  );
  assert.ok(parsed instanceof Date);
  // 09:00 Taipei on 2026-05-10 is 01:00Z the same day.
  assert.equal(parsed.toISOString(), "2026-05-10T01:00:00.000Z");
});

test("parseDateFromTitle returns null for a future date", () => {
  // The card that prompted the ticket: /news/876055, dated five days ahead.
  assert.equal(
    parseDateFromTitle("2026.09.05(六)《當身體遇見社會：性諮商工作坊》", NOW),
    null,
  );
});

test("parseDateFromTitle accepts the slash and dash separators too", () => {
  assert.equal(
    parseDateFromTitle("2026/05/10 課程公告", NOW).toISOString(),
    "2026-05-10T01:00:00.000Z",
  );
  assert.equal(
    parseDateFromTitle("2026-05-10 課程公告", NOW).toISOString(),
    "2026-05-10T01:00:00.000Z",
  );
});

test("parseDateFromTitle returns null when the title has no date", () => {
  assert.equal(parseDateFromTitle("本年度課程總覽", NOW), null);
});

test("a future-dated title yields an item the gate lets through as undated", () => {
  // The two rules compose: parseDateFromTitle drops the event date, and the
  // gate then dates the item by first-seen (now) rather than rejecting it.
  // The announcement is still ingested — it just stops claiming to be from
  // the future, so it sorts where it belongs.
  const publishedAtUtc = parseDateFromTitle("2026.09.05(六)《課程》", NOW);
  assert.equal(publishedAtUtc, null);
  assert.equal(isFresh({ publishedAtUtc }, NOW), true);
});

// ---------------------------------------------------------------------------
// The seven retired feeds (issue #92)
// ---------------------------------------------------------------------------

test("the seven dead Google site: feeds are no longer fetched", () => {
  const codes = new Set(RSS_FEEDS.map((feed) => feed.code));
  for (const dead of [
    "love_newlife",
    "greenpeace",
    "healthforall",
    "worldpeace",
    "commonhealth_club",
    "twhealth",
    "durex_article",
  ]) {
    assert.equal(codes.has(dead), false, `${dead} must be removed`);
  }
});

test("the eleven productive site: feeds are kept — the gate handles their noise", () => {
  const codes = new Set(RSS_FEEDS.map((feed) => feed.code));
  for (const kept of [
    "ubrand_udn",
    "esg_gvm",
    "nhi",
    "commonhealth",
    "ttvc",
    "ntuh_news",
    "vghtpe_news",
    "esg_businesstoday",
    "ntuh_ifc_news",
    "ibt",
    "csr_cw",
  ]) {
    assert.equal(codes.has(kept), true, `${kept} must be kept`);
  }
});

test("every retired source still resolves a label, because its rows remain", async () => {
  const { hasSourceLabel } = await import("../news/sourceLabels.ts");
  for (const sourceName of [
    "love_newlife",
    "greenpeace",
    "healthforall",
    "worldpeace",
    "commonhealth_club",
    "twhealth",
    "durex",
  ]) {
    assert.equal(
      hasSourceLabel(sourceName),
      true,
      `${sourceName} rows are not deleted, so it still needs a label`,
    );
  }
});
