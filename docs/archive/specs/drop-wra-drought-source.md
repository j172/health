# Decision Record: Drop the WRA Drought Source

- **Ticket ID**: `SPEC-HEALTH-20260831-DROP-WRA`
- **Supersedes**: `SPEC-HEALTH-20260831-WRA-SINGLE-WRITER`, which was written on a false premise
- **Closes**: #94, #13

---

## 1. What happened

#94 filed a structural defect: `news_items` had two writers, and `lib/server/wra/runSync.ts` bypassed every rule added to the ingestion pipeline — the freshness gate, chrome scoping, the tier-2/3 uniqueness rule, the tier-1 hospital fix. The plan was to route WRA through `persistItems` so there was one writer and one place to add rules.

Both the issue and its spec asserted the change was safe because "drought bulletins are always current — that is the nature of the source."

**That was wrong, and checking it is what stopped the change from shipping.** Every one of the 15 active bulletins fails a 90-day freshness check:

```
地下水及海淡廠              2014-12-01   4291 days
地下水                      2015-05-04   4137 days
石門水庫                    2024-03-19    895 days
翡翠水庫                    2022-08-27   1465 days
鯉魚潭水庫(石岡壩)          2026-04-27    126 days   ← the newest of any record
寶山第二水庫(寶山水庫)      2026-04-27    126 days
…15 of 15 rejected
```

Not a parsing artefact: all 565 `通報日期` values parse cleanly, so the `COALESCE(published_at_utc, first_seen_at_utc)` fallback never fires. `WRA_DROUGHT_URL` is a **historical bulletin log going back to 2012-07-18**, and `latestRecordPerReservoir` returns each reservoir's most recent entry however old it is.

Routing it through `persistItems` as specified would have dropped the entire feed on the first run, silently, while the daily workflow kept reporting success.

## 2. The decision

**Remove the source.**

By the standard `SPEC-HEALTH-20260831-FRESHNESS-GATE` used to drop seven feeds — two or fewer fresh items in 90 days — WRA contributes **zero**, and does so by design rather than by accident.

The counter-argument was considered and rejected: a reservoir's 2024 restriction may still be *in effect*, so the data is arguably current *state* with an old *announcement date*, and a news freshness gate is the wrong instrument for it. That reading is defensible, but it implies the right home for this data is not `news_items` at all — and building a second, differently-governed lane inside the news pipeline is what created #94 in the first place.

## 3. What is removed, and what is not

Removed:

```
lib/server/wra/client.ts
lib/server/wra/runSync.ts
app/api/admin/wra-sync/route.ts
.github/workflows/wra-drought-sync.yml
scripts/gha-wra-drought-sync.mjs
```

`persistItems` is now the only `INSERT INTO news_items` in the codebase — the structural fix #94 asked for, reached by removing the second writer rather than merging it.

**Not removed: the 15 existing rows.** Consistent with the standing decision not to delete `news_items` rows. They render correctly without any code, because the label lives in each row's stored `feed_name` (「經濟部水利署 枯旱限水通報」) rather than in `sourceLabels.ts`, where `wra` was never registered. Verified on `/news/799228`.

**Nothing else consumed them.** `lib/server/news/queries.ts` records that `listActiveWeatherWarnings` was retired when the 即時氣象警報 widget moved to reading `cwa_alerts` directly, and that "WRA drought bulletins stay ordinary news items rather than alerts, so this query and its per-source window table had no callers left."

## 4. If this is ever reconsidered

The data is not worthless — it is the current restriction level per reservoir. Bringing it back should mean its own table and its own read path, not a news row with a 2014 publication date. `cwa_alerts` is the precedent: a source with severity, area and expiry got its own table rather than being flattened into `news_items`.
