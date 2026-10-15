/**
 * Snapshot-reconcile guard (Track B spec §4 item 2). A latest-state table that
 * mirrors a whole upstream snapshot may delete the rows a sync no longer saw —
 * but only when this run's snapshot looks complete. An empty response, a
 * truncated file or an HTML error page served with HTTP 200 must never wipe
 * the table, so the delete is refused (and the caller records an ingest error)
 * when the snapshot is empty or smaller than `minRatio` of what the table held.
 *
 * Same principle as `runFacilitySync`'s "fetch first, only delete when
 * non-empty". Deliberately generic so other snapshot tables can reuse it.
 */
export type ReconcileRefusalReason = "empty_snapshot" | "below_min_ratio";

export interface ReconcilePlan {
  shouldDelete: boolean;
  reason: ReconcileRefusalReason | null;
}

export const planSnapshotReconcile = (params: {
  fetchedCount: number;
  existingCount: number;
  /** Fraction of the previous row count the new snapshot must reach. Default 0.5. */
  minRatio?: number;
}): ReconcilePlan => {
  const { fetchedCount, existingCount, minRatio = 0.5 } = params;
  if (fetchedCount <= 0) return { shouldDelete: false, reason: "empty_snapshot" };
  if (existingCount > 0 && fetchedCount < existingCount * minRatio) {
    return { shouldDelete: false, reason: "below_min_ratio" };
  }
  return { shouldDelete: true, reason: null };
};
