# `ensureSchema()` concurrent-call race causes MySQL deadlocks on cold start

## Context

Discovered 2026-09-23 (~09:24 UTC) while diagnosing a live 502 on health.j172.tw during an unrelated incident (Cloudflare AI circuit-breaker work, PR #395/#396). The watchdog had just restarted `health-web` (`apply-prebuilt-force`, probe succeeded). Minutes into the fresh process's life, `health-web-error-3.log` recorded:

```
⨯ Error: Deadlock found when trying to get lock; try restarting transaction
    at n (lib/server/db/mysql.ts:292:11)
    at async o (lib/server/db/mysql.ts:571:3)
    at async p (lib/server/db/mysql.ts:585:12)
    at async Module.x [as generateMetadata] (app/news/[id]/page.tsx:48:16) {
  code: 'ER_LOCK_DEADLOCK',
  errno: 1213,
  sqlState: '40001',
  sql: '\n' +
    '    UPDATE facilities\n' +
    "    SET source_id = SUBSTRING(CONCAT(name, '|', COALESCE(address, '')), 1, 100),\n" +
    '        updated_at = NOW()\n' +
    "    WHERE source_key = 'mol_occupational_injury'\n" +
    "      AND source_id REGEXP '^[0-9]+$'\n" +
    '  ',
}
```

A visitor loading a news article page (`app/news/[id]/page.tsx`'s `generateMetadata`) should never be the origin of a write to the `facilities` table for an unrelated open-data source (`mol_occupational_injury`, MOL occupational-injury hospital data). That mismatch is the clue to the real bug.

## Root cause

`lib/server/db/mysql.ts:58` — `ensureSchema()`:

```ts
let schemaReady = false;                 // line 13

export const ensureSchema = async (): Promise<void> => {
  if (schemaReady) return;               // line 59 — check
  const p = getMysqlPool();
  await p.query(TABLE_DDL.newsItems);
  // ...108 total `await p.query(...)` calls: table DDL, column backfills,
  // one-off data migrations (including the mol_occupational_injury UPDATE
  // at line 292-298), and seed inserts...
  schemaReady = true;                    // line 565 — set, only after everything above finishes
};
```

`ensureSchema()` is called — unconditionally, every time — from at least 11 call sites across the codebase: `withConnection` (mysql.ts:571, which is what `app/news/[id]/page.tsx`'s `generateMetadata` goes through), `lib/server/facilities/geocodeBatch.ts`, `lib/server/news/backfillOgImages.ts` (5 call sites), `lib/server/news/cardImages.ts`, `lib/server/books/service.ts` (2 call sites).

`schemaReady` is a plain boolean with no atomicity between the check (line 59) and the set (line 565). On a **freshly started process** — which is exactly when this fired, seconds after the watchdog's `apply-prebuilt-force` delete+start — `schemaReady` starts `false` and stays `false` for as long as the *first* `ensureSchema()` call takes to run all 108 statements. Any other call into `ensureSchema()` that arrives during that window (a concurrent page render, a concurrent backfill/geocode background job, a concurrent RSS ingestion touching `withConnection`) also sees `schemaReady === false`, and *also* runs the entire 108-statement migration block in parallel with the first one. Several of those statements are unconditional `UPDATE`s against `facilities` (including the `mol_occupational_injury` one) with no idempotency guard beyond "the WHERE clause matches nothing once already applied" — two concurrent transactions updating overlapping rows in different orders is a textbook MySQL deadlock (`ER_LOCK_DEADLOCK` / `40001`).

This is a classic check-then-act (TOCTOU) race, not a facilities-import bug and not related to the Cloudflare AI / memory-pressure crash family being chased in the rest of tonight's session — it's a separate, pre-existing bug that just happens to be most visible right after every cold start (deploy, crash-restart, or watchdog recovery), which is exactly when call volume across multiple pages/routes/background jobs tends to spike back up at once.

## Impact

- A `generateMetadata()` (or any other `ensureSchema()`-gated call) that loses the deadlock race throws and presumably fails that request/page (news article metadata generation, image backfill, geocode batch, book service) — a real but usually self-limiting failure (MySQL deadlock victims can typically be retried).
- Wasted DB load: every cold-start race duplicates up to 108 DDL/DML statements running concurrently instead of once.
- Likely a contributing, previously-unattributed cause of some fraction of the "site slow/erroring right after a restart" pattern already tracked in `docs/memory` (`ops_health_502_watchdog`), since cold starts (deploys, crash-restarts, watchdog recoveries) are precisely when concurrent request volume and this race coincide.

## Suggested fix

Replace the boolean flag with an in-flight promise cache so concurrent callers share one execution instead of each starting their own:

```ts
let schemaReadyPromise: Promise<void> | null = null;

export const ensureSchema = async (): Promise<void> => {
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = (async () => {
    const p = getMysqlPool();
    await p.query(TABLE_DDL.newsItems);
    // ...unchanged body...
  })();
  try {
    await schemaReadyPromise;
  } catch (error) {
    schemaReadyPromise = null; // allow a retry on the next call instead of wedging forever
    throw error;
  }
};
```

This is a small, low-risk, well-understood fix (standard memoize-in-flight-promise pattern) that doesn't change the SQL or the intended one-time-migration semantics — it only makes the "only run once" guarantee the function already claims to provide actually hold under concurrency.

## Out of scope for this spec

- Not attempting to make the 108 individual migration statements themselves idempotent/transactional as a second layer of defense — the promise-cache fix removes the concurrency window that causes the deadlock in the first place, which is the actual bug.
- Not investigating whether `ensureSchema()`'s "run everything on every cold start" design (rather than a proper migration/version table) should be restructured — out of scope, pre-existing design predating this bug.
