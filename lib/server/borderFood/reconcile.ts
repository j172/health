/**
 * Snapshot-reconciliation guard (docs/2.0/track-b-opendata-phase2-3-spec.md
 * §4 item 2). `border_food_rejections` is a rolling snapshot of the upstream
 * list: after a successful sync, rows the upstream no longer lists are
 * deleted. That is only safe when the response is plausibly a *full*
 * snapshot — an empty body, a truncated download or a block page parsed down
 * to a handful of rows must never be allowed to wipe the table. Same
 * "fetch first, delete only when non-empty" principle as
 * `runFacilitySync`'s `replaceBaselineForCounty`.
 */
export const MIN_SNAPSHOT_RATIO = 0.5;

export interface SnapshotGuardVerdict {
  ok: boolean;
  /** Human-readable explanation when `ok` is false, otherwise null. */
  reason: string | null;
}

export const evaluateSnapshotGuard = (fetchedCount: number, previousCount: number): SnapshotGuardVerdict => {
  if (fetchedCount <= 0) {
    return {
      ok: false,
      reason: `Upstream snapshot has 0 rows (table currently holds ${previousCount}); refusing to treat an empty response as a full snapshot.`,
    };
  }
  if (previousCount > 0 && fetchedCount < previousCount * MIN_SNAPSHOT_RATIO) {
    return {
      ok: false,
      reason: `Upstream snapshot shrank from ${previousCount} to ${fetchedCount} rows (below ${MIN_SNAPSHOT_RATIO * 100}% of the previous snapshot); treating the source as anomalous and leaving the table untouched.`,
    };
  }
  return { ok: true, reason: null };
};
