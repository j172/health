# Spec & Ticket: Drug Label (仿單) Structured Data Source — Blocked

- **Ticket ID**: `SPEC-HEALTH-20260907-DRUG-LABEL-SOURCE-C`
- **Status**: BLOCKED (no known official structured source as of 2026-09-07)
- **Priority**: LOW (P3) — unblock only if a real source turns up
- **Affects (future)**: `/tools/drugs`
- **Split from**: `SPEC-HEALTH-20260907-TWINKLE-TOOLS-A` §2.1

---

## 1. What this covers

Three Twinkle Hub tools that depend on structured TFDA drug package-insert (仿單) text:

- `get_drug_details` (單一藥品全文詳細)
- `search_drug_label` (藥品仿單結構化欄位搜尋)
- `check_drug_interaction` (藥品交互作用初步篩查)

## 2. Why this is blocked

A live survey on 2026-09-07 (subagent research, web search + data.fda.gov.tw export listing)
found:

- `data.fda.gov.tw`'s open-data exports cover only: license + appearance (export 42, → this
  repo's `drugs` table) and ingredients (export 43, → `tfda_drug_ingredients`). No export for
  indications/contraindications/side-effects/interactions/dosage/warnings/storage.
- The actual package-insert text is published per-drug as PDF on consumer.fda.gov.tw, with no
  bulk API or structured export.
- No public TFDA drug-drug interaction matrix exists at all (confirmed independently — see
  `SPEC-HEALTH-20260907-TWINKLE-TOOLS-A` §2.1's disclaimer language, which was written for the
  same reason).

## 3. Options if this is revisited

1. **Official channel**: email TFDA opendata contact (as used for the health-supplements survey)
   asking whether a structured label export exists or is planned.
2. **PDF extraction pipeline**: scrape consumer.fda.gov.tw per-license PDF pages, run text
   extraction, and hand-map into `indications`/`contraindications`/etc. columns. High fragility
   (PDF layout varies by era of filing), and — being medical-safety-adjacent text — any parsing
   error has real user-safety consequences (e.g. a truncated 禁忌 section). If pursued, this needs
   its own spec with an explicit accuracy/validation plan (e.g. spot-check against the live PDF
   for a sample, a "last verified" timestamp shown per drug, checked against
   `docs/specs/drop-wra-drought-source.md`'s standard of "check the freshness/quality claim
   before shipping, don't assume it's fine").
3. **Licensed data provider**: some commercial drug-reference vendors sell structured Taiwan
   drug-label data; out of scope unless the site owner wants to pay for a data license.
4. **Drop permanently**: if none of the above pan out, formally close this ticket as won't-fix
   rather than leaving it open indefinitely.

## 4. Do not

Do not build the interaction-checker or label-search tabs against a scraped/unverified source
without first getting this ticket un-blocked with an explicit reviewed plan — this is the same
class of mistake `drop-wra-drought-source.md` documents (shipping on an unverified assumption
about data freshness/quality).
