/**
 * Rolling-snapshot reconciliation guard for garbage_route_stops (issue #674,
 * spec §4.2). After a city's stops are upserted, rows the run did not see are
 * deleted so a route the city retired stops showing — but only when the fetch
 * looks like a complete snapshot. An empty or sharply shrunken response (an
 * upstream outage or a maintenance page that happened to parse) must leave the
 * existing rows alone and be reported instead.
 *
 * Same "fetch first, only replace when non-empty" principle as
 * runFacilitySync's replaceBaselineForCounty, plus the 50% floor from the spec.
 */

/** A fetch must return at least this share of the previous row count before stale rows are pruned. */
export const MIN_SNAPSHOT_RATIO = 0.5;

export type SnapshotPruneDecision = { prune: true } | { prune: false; reason: string };

export function decideSnapshotPrune(input: { fetched: number; previousCount: number }): SnapshotPruneDecision {
  const { fetched, previousCount } = input;

  if (fetched <= 0) {
    return { prune: false, reason: `source returned 0 rows (previous snapshot had ${previousCount}); existing rows kept` };
  }

  if (previousCount > 0 && fetched < previousCount * MIN_SNAPSHOT_RATIO) {
    return {
      prune: false,
      reason: `source returned ${fetched} rows, under ${MIN_SNAPSHOT_RATIO * 100}% of the previous ${previousCount}; treated as an anomalous fetch, stale rows not pruned`,
    };
  }

  return { prune: true };
}
