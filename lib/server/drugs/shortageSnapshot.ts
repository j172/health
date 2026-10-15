/**
 * Rolling-snapshot reconciliation guard (spec docs/2.0/track-b-opendata-phase2-3-spec.md §4 rule 2).
 *
 * The shortage tables are "latest state" tables: after a successful sync the
 * rows the upstream no longer lists (shortage resolved) must disappear. But a
 * delete-what-you-did-not-see step is exactly what turns a broken upstream
 * (outage page, truncated export, schema change that parses to a few rows)
 * into an emptied production table. So: upsert always, delete only when the
 * fresh snapshot looks plausibly complete — same "fetch first, delete only if
 * non-empty" principle as runFacilitySync's replaceBaselineForCounty.
 */

/** A snapshot must retain at least this share of the previous row count to be allowed to delete. */
export const SNAPSHOT_MIN_KEEP_RATIO = 0.5;

/**
 * Below this many existing rows the table is small enough that legitimate
 * churn (a 5-item list dropping to 1) would trip a percentage rule, so only
 * the "empty response" check applies.
 */
export const SNAPSHOT_GUARD_MIN_BASELINE = 20;

export interface SnapshotReconcileInput {
  /** Rows parsed from this run's response. */
  fetched: number;
  /** Rows currently stored for this source. */
  existing: number;
  /** The upstream explicitly answered "沒有資料" (an authoritative empty list), as opposed to an empty/garbled response. */
  noDataPlaceholder: boolean;
}

export type SnapshotReconcileDecision = { reconcile: true } | { reconcile: false; reason: string };

export function decideSnapshotReconcile({ fetched, existing, noDataPlaceholder }: SnapshotReconcileInput): SnapshotReconcileDecision {
  // Nothing stored: there is nothing a delete could wrongly remove.
  if (existing === 0) return { reconcile: true };

  if (existing < SNAPSHOT_GUARD_MIN_BASELINE) {
    if (fetched === 0 && !noDataPlaceholder) {
      return {
        reconcile: false,
        reason: `empty response (0 rows, no "沒有資料" placeholder) while ${existing} rows are stored; kept them`,
      };
    }
    return { reconcile: true };
  }

  const floor = Math.ceil(existing * SNAPSHOT_MIN_KEEP_RATIO);
  if (fetched < floor) {
    return {
      reconcile: false,
      reason: `snapshot has ${fetched} rows but ${existing} are stored (< ${Math.round(SNAPSHOT_MIN_KEEP_RATIO * 100)}%); treated as a broken source and kept the stored rows`,
    };
  }
  return { reconcile: true };
}
