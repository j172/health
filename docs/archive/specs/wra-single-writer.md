# Spec & Ticket: Route WRA Through persistItems So news_items Has One Writer

- **Ticket ID**: `SPEC-HEALTH-20260831-WRA-SINGLE-WRITER`
- **Priority**: MEDIUM (P2)
- **Affects**: `lib/server/wra/runSync.ts`
- **Closes**: #94

---

## 1. Problem Statement

`news_items` has two writers:

```
lib/server/rss/persistItems.ts   INSERT INTO news_items (…)   30 columns, gated
lib/server/wra/runSync.ts:132    INSERT INTO news_items (…)   17 columns, ungated
```

Everything added to the ingestion pipeline recently applies to the first and not the second:

- the freshness gate (`SPEC-HEALTH-20260831-FRESHNESS-GATE`) sits in `runIngestion` and `processSpecialSource`, both of which funnel into `persistItems`
- chrome scoping, the tier-2/3 uniqueness rule, the tier-1 hospital fix and `classifyLocationPrecision` all run during extraction, which the WRA path never calls

So WRA rows have never been landmark-extracted, are not age-checked, and carry none of the geo or SEO columns. **Nothing reports this.** It was found by reading a grep result, not by any check.

Not currently causing bad data — drought bulletins are always current, and a bulletin naming several counties would correctly yield no landmark anyway. The defect is structural: a second writer exists that no future rule will cover, and the next person adding one will have the same blind spot without knowing it.

## The gap is smaller than it looks

WRA already writes 17 columns that map almost one-to-one onto `NormalizedRssItem`'s 16 fields. It supplies everything except `displayType`, `publicBeginAtTaipei` and `publicEndAtTaipei` — all nullable.

---

## 2. Agreed Architectural Blueprint

### 2.1 One writer

WRA builds a normalized item and hands it to `persistItems`. Its own `INSERT INTO news_items` goes away, leaving `persistItems` as the only statement that inserts into that table.

### 2.2 Enrichment is skipped, not run

`persistItems` takes `EnrichedRssItem`, which extends `NormalizedRssItem` with `detailHtml`, `detailText`, `assets`, `metaTitle`, `metaDescription`, `keywords` and `geoSummary` — the products of AI SEO generation and landmark extraction.

WRA supplies empty/default values for those and **does not** invoke the AI SEO call or the geo extractor. Deliberate:

- A drought bulletin names several counties, so the uniqueness rule from `SPEC-HEALTH-20260829-LANDMARK-SATURATION` would return no landmark anyway. Running the extractor to be told "nothing" is pure cost.
- The bulletin text *is* the summary; an AI-generated one adds nothing and costs a call per bulletin.

The point of this change is a single place to add rules, not identical treatment.

### 2.3 The freshness gate now applies

Once WRA goes through the same path, its items are age-checked like everything else. Drought bulletins are current, so nothing should be rejected — **the implementer must confirm that against real data rather than assuming it**, because a bulletin whose `publishedAtUtc` parses oddly would now silently vanish where before it was written unconditionally.

---

## 3. Explicit Non-Goals

- Do **not** run the AI SEO generation or the geo extractor for WRA items.
- Do **not** change `persistItems`' own logic, the freshness gate, or any extraction code.
- Do **not** change what WRA fetches, how it parses bulletins, or its schedule.
- Do **not** backfill or modify existing WRA rows.
- Do not add npm dependencies.

---

## 4. Verification

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Prove there is now exactly one `INSERT INTO news_items` in the codebase, and say how you checked.
- Show that a real WRA bulletin survives the freshness gate — fetch one, run it through the normalization, and report the computed age and verdict. If any real bulletin would be rejected, stop and report rather than shipping a change that silently drops them.
- State which `NormalizedRssItem` fields WRA supplies, which are null, and why each null is correct.
- Note that WRA rows will still differ from RSS rows in the geo/SEO columns, and that this is intended.
