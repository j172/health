# Spec & Ticket: Remove Resurrected WRA and Mababy Files

- **Ticket ID**: `SPEC-HEALTH-20260907-RESURRECTED-CLEANUP`
- **Priority**: MEDIUM (P2) — no live impact, but untracked dead code sitting in
  the working tree risks being accidentally committed by a future change
- **Not a new decision** — re-applies two decisions already made and merged

---

## 1. What happened

Five files reappeared in the working tree as **untracked**, byte-identical to
versions that were deliberately removed and merged to `main` earlier:

```
lib/server/wra/client.ts                  removed in c8e85fd
lib/server/wra/runSync.ts                 removed in c8e85fd
.github/workflows/wra-drought-sync.yml    removed in c8e85fd
app/api/admin/wra-sync/route.ts           removed in c8e85fd
scripts/gha-wra-drought-sync.mjs          removed in c8e85fd
lib/server/rss/fetchMababyNews.ts         removed in 16e8106
```

Verified byte-identical via `git diff <removal-commit>~1:<path> <path>` —
zero output for every file. None are wired back into the pipeline: `git grep`
across `lib/server/config/rss-feeds.ts`, `lib/server/cron/registerJobs.ts`,
`lib/server/news/sourceLabels.ts` and `lib/server/news/sourceCategories.ts`
finds no active reference, only the removal comment already in
`registerJobs.ts`. `types/rss.ts`'s `FeedCode` union does not list `wra` or
`mababy`.

**Likely cause:** the `.git/index` corruption encountered and repaired
earlier in this session (`git read-tree HEAD`, a non-destructive rebuild from
`HEAD`) — or some other concurrent git operation in this repository. The
mechanism is not fully known and is not worth chasing; the fix is the same
either way.

## 2. Why this is not a new design decision

Both removals already have a paper trail:

- WRA: `docs/specs/drop-wra-drought-source.md`, merged via PR #106, closing
  #94 and #13. Reason: the source is a historical bulletin log back to 2012;
  none of its 15 active records falls inside the 90-day freshness window the
  news pipeline applies, and it would have silently dropped its entire feed
  if routed through the shared writer.
- Mababy: removed across `1001fba` (dewire) and `16e8106` (delete), bundled
  with the NTUH source drop.

This ticket does not re-litigate either call. It restores `main`'s intended
state.

## 3. Scope

Remove the five untracked files. Confirm no other untracked or modified file
in the working tree references them (in particular: do not touch
`package.json`'s unrelated `backfill:opendata-geo` entry, or any file under
`agent/skills/tw-opendata-geo/`, `docs/specs/phase17-opendata-geo-facility-backfill.md`,
or `scripts/backfill-*-opendata-geo*.mjs` / `scripts/backfill-nfcc-accessible-atm.mjs`
— unrelated in-flight work sitting in the same working tree, not part of this
ticket).

## 4. Non-Goals

- Do not modify `package.json`.
- Do not touch anything under `agent/skills/tw-opendata-geo/` or the phase17
  spec/backfill scripts.
- Do not re-open the original removal decisions.
- Do not add a `.gitignore` entry or other guard against recurrence — the
  cause is a one-off git-state anomaly, not a repeatable pattern.

## 5. Verification

- `git status --short` shows none of the five paths afterward.
- `git grep -i "wra\|mababy"` across `lib/`, `app/`, `scripts/`, `.github/`
  turns up only the existing removal comment in `registerJobs.ts` and the
  two decision-record docs — nothing else.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass,
  proving nothing in the current, wired codebase depended on the resurrected
  files.
