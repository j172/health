# Spec & Ticket: Tier 1 Must Identify One Hospital, or Decline

- **Ticket ID**: `SPEC-HEALTH-20260831-TIER1-MULTI`
- **Status**: TODO
- **Priority**: MEDIUM (P2)
- **Affects**: `lib/server/news/facilityMatch.ts`, `lib/server/news/geoExtractor.ts`

---

## 1. Problem Statement

`SPEC-HEALTH-20260829-TIER1-FACILITY` (#84) made each `searchName` resolve to exactly one hospital. It did not address an article naming **several different** hospitals: `extractLocationFromText` walks `COMMON_HOSPITAL_PATTERNS` in array order and returns on the first regex that matches, so the winner is decided by **position in the table**.

`SPEC-HEALTH-20260829-LANDMARK-SATURATION` (#65) established the governing rule for districts — *a tier is used only when it identifies one place*. Tier 1 never got it.

### Measured, 89 hospital-relevant articles (live, 2026-08-31)

Sampled via `/api/news/search` on hospital terms, matching the 53 patterns against each article's `div.news-article` body:

```
no match          22
exactly one       57
several           10      = 15% of the 67 that match anything
```

### The finding that shapes the fix

Of those 10, **three are not multi-hospital at all**:

```
/news/779356   淡水馬偕紀念醫院 , 馬偕紀念醫院
/news/720110   淡水馬偕紀念醫院 , 馬偕紀念醫院
/news/627919   台東馬偕紀念醫院 , 馬偕紀念醫院
```

`/馬偕醫院|馬偕紀念醫院/` matches **inside** 「淡水馬偕紀念醫院」. One hospital fires two patterns. A naive "several matches → decline" rule would discard the correct, unique answer in 30% of the multi-match cases — and those are precisely the cases where tier 1 works.

The genuinely multi-institution ones:

```
/news/879546   臺中榮民總醫院 , 高雄長庚紀念醫院 , 衛生福利部桃園醫院
/news/877122   臺中榮民總醫院 , 衛生福利部桃園醫院
/news/874073   臺中榮民總醫院 , 林口長庚紀念醫院
/news/727150   臺中榮民總醫院 , 三軍總醫院附設民眾診療服務處
/news/855243   大林慈濟醫院 , 斗六慈濟醫院
```

---

## 2. Agreed Architectural Blueprint

### 2.1 Collect all matches, resolve subsumption, then require uniqueness

Replace "return on first regex hit" with:

1. Collect every pattern whose regex matches, and resolve each to its institution.
2. **Resolve subsumption.** Where one resolved name contains another as a substring (`馬偕紀念醫院` ⊂ `淡水馬偕紀念醫院`), keep the **longer, more specific** one and drop the subsumed. The specific name is what the article actually says.
3. If exactly one institution survives, use it.
4. If several genuinely different institutions survive, **decline** — return no tier-1 match and let the waterfall fall through to the district and county tiers.

### 2.2 Do not try to collapse siblings to a parent

An article naming 大林慈濟 and 斗六慈濟 could in principle resolve to 「佛教慈濟醫療財團法人」. It cannot here: #84 measured that **no exact-name row exists** for `佛教慈濟醫療財團法人`, `長庚醫療財團法人`, or `三軍總醫院` — those families exist in the table only as branches. Sibling cases therefore decline, like any other multi-institution article.

### 2.3 Existing rows need a backfill

Existing `facility` landmarks will **not** self-correct. `persistItems.ts:116` takes the unchanged early-out when `payload_hash` is unchanged, so extraction never re-runs; `runNewsGeocodeBatch` and `cardImages` both select on `lat IS NULL` while these rows hold a non-null `lat`.

After this ships and deploys, run `/api/admin/news-landmark-backfill` **as a dry run first** and review the `byTransition` breakdown before any live write. That sequence caught a regression last time — the dry run revealed tier 1 pointing articles at health-screening rows, and stopped a write that would have made the data worse.

---

## 3. Explicit Non-Goals

- Do **not** add a frequency or position heuristic ("most-mentioned wins", "first-mentioned wins"). Rejected: with three hospitals named side by side, mention count does not track which one the article is about, and it makes the result sensitive to trivial wording changes.
- Do **not** change tier 2, tier 3, tier 4, the waterfall order, or any rendering.
- Do **not** run the backfill live as part of this ticket.
- Do not add npm dependencies.

---

## 4. Verification & Quality Assurance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.
- Unit-test the decision table against the measured cases:
  - `淡水馬偕紀念醫院` + `馬偕紀念醫院` → resolves to 淡水馬偕紀念醫院 (subsumption), **not** a decline
  - `臺中榮民總醫院` + `林口長庚紀念醫院` → decline
  - `大林慈濟醫院` + `斗六慈濟醫院` → decline (siblings, no parent row to collapse to)
  - one match → unchanged
  - no match → falls through as before
- Re-run the measurement script on the same 89-article sample and report how many articles change verdict, so the coverage cost of declining is visible rather than assumed.
