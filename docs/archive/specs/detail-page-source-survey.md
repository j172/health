# Spec & Ticket: Survey Every Detail-Page Source and Fix the Broken Ones

- **Ticket ID**: `SPEC-HEALTH-20260830-SOURCE-SURVEY`
- **Status**: TODO
- **Priority**: MEDIUM (P2)
- **Affects**: `lib/server/rss/fetchDetailPage.ts`
- **Builds on**: `SPEC-HEALTH-20260829-CHROME-SCOPING` (#71), which added the per-source table but configured only two hosts

---

## 1. Problem Statement

`SPEC-HEALTH-20260829-CHROME-SCOPING` added a per-host scoping table (`skip` / `only` / `without`) and deliberately configured only what had been measured: `cwa.gov.tw` → `skip`, `twstreetcorner.org` → `without`. Everything else runs the default container selection.

Two gaps have accumulated since.

### 1.1 Ten new sources arrived unmeasured

Phase 14 and Phase 15 added roughly ten feeds — 長庚衛教/新聞稿, 臺北榮民總醫院, UDN 女子漾, iLady, 臉紅紅, 嵩馥, 媽咪拜, 台灣性諮商學會, 台灣性教育學會, and the NHI feed switched to a Google News search RSS. None has a scoping entry, and none was measured.

`lib/server/config/rss-feeds.ts` now holds **48 feeds**. Roughly half point at `news.google.com`, whose links redirect to the real publisher, so the effective host set is larger than the feed list suggests.

### 1.2 Two sources produce no article text at all

While surveying for #71 it was observed — and left out of scope — that:

```
mamaclub.com   detailText projects to  0 characters
heho.com.tw    detailText projects to 18 characters
```

That is **not** the chrome problem. Chrome contamination adds junk; this is the body not being inside the selected container at all, so `detailText` comes back empty or near-empty. Those articles then have no text for the landmark extractor, the GEO summary, image search terms, or reading-time estimation to work from.

---

## 2. Agreed Architectural Blueprint

### 2.1 Measure first — this is not optional

Before configuring any host, resolve a **real, current article URL** for it and run the actual `extractDetailContent` projection over the fetched HTML. Record, per host:

- which container the current logic selects (`article` / `main` / `#maincontent` / `body` fallback)
- `detailText` length, and the first ~200 characters
- whether the article's real body is present in that text
- whether obvious chrome (nav labels, share widgets, player controls, related-article lists) is present

**Configure only what you measured.** The five dead `臺北市立聯合醫院X院區` entries fixed in #84 existed because someone wrote plausible-looking values without checking them against reality. Do not repeat that here with selectors.

If a host cannot be fetched from the runner (some publishers block datacentre IPs — `nhi` already does, and `hpa.gov.tw` failed during the #71 survey), **leave it on the default and say so.** An unmeasured host stays unconfigured.

### 2.2 Fix the empty-body sources

`mamaclub.com` and `heho.com.tw` need an `only` selector naming the container that actually holds the article, verified to produce a plausible body length. If no such container exists — if the body is rendered client-side and is not in the HTML at all — say that plainly; `skip` is then the honest configuration, since `descriptionText` is all there is.

### 2.3 Report the whole survey, including the hosts left alone

The deliverable is as much the measurement table as the code. A host left on the default with a recorded reason is a good outcome; a host silently skipped is not.

---

## 3. Explicit Non-Goals

- Do **not** write a generic chrome heuristic. Rejected in #71: Chinese article prose contains links and does not reliably carry sentence-ending punctuation such a rule would key on.
- Do **not** modify `geoExtractor.ts`, `facilityMatch.ts`, `administrativeArea.ts`, `locationPrecision.ts`, `taiwanDistricts.ts`, or any rendering component.
- Do **not** re-run the #72 backfill; it has already run against the full table.
- Do **not** add or remove feeds in `lib/server/config/rss-feeds.ts`.
- Do **not** add npm dependencies.

---

## 4. Verification & Quality Assurance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.
- A survey script under `scripts/` that can be re-run when sources change, following the style of `scripts/verify-hospital-search-names.mjs`. Run it and paste the full table.
- For every host newly configured: before/after `detailText` length and a text sample.
- For `only` and `without` hosts: evidence that `detailHtml` and the image asset list are unchanged, as #71 established.
- Fixture-based tests for any new entry, in `lib/server/rss/__fixtures__/`, following `fetchDetailPage.test.mjs`.
- State explicitly which of the 48 feeds were measured, which were unreachable, and which were left on the default and why.
