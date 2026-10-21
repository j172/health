/**
 * Generic per-type failure isolation for the "/nearby" aggregation API
 * (issue #466 acceptance criterion: "任一類型查詢失敗不影響其他類型正常顯示").
 *
 * Deliberately knows nothing about facilities/emergency-rooms/disaster-points
 * — each caller supplies a `run()` closure per type, and this module just
 * runs them all through `Promise.allSettled` and turns each outcome into a
 * uniform ok/error result. Same isolation shape as
 * the per-county TDX fetchers (lib/server/facilities/sources/tdxParking.ts): one type throwing (a
 * timeout, a DB error, an unexpected shape) never takes down the others, and
 * is reported rather than silently dropped.
 *
 * Splitting this out from lib/server/nearby/queries.ts (which wires in the
 * real facilities/ER/shelter queries) keeps the isolation logic itself
 * trivially testable with synthetic tasks — no DB connection required.
 */

export interface NearbyItem {
  id: string | number;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  /** Rounded to 1 decimal place (km), or null if the underlying query didn't compute one. */
  distanceKm: number | null;
  /** Free-form per-kind extra fields (e.g. ER congestion level) the UI may choose to render. */
  extra?: Record<string, unknown>;
}

/**
 * What a facility row contributes to `NearbyItem.extra`: only its data date
 * (`extra_json.dataAsOf`, `YYYY-MM-DD`) and the source organisation (`data_org`), so the
 * "/nearby" card can say how fresh the list is and whose open data it is (issue #677:
 * 派出所 is imported by hand about twice a year, so the date matters). Nothing else from
 * `extra_json` leaks into the API. `undefined` — not `{}` — when the row carries no
 * data date, which keeps every other facility type's payload exactly as before.
 */
export function buildFacilityNearbyExtra(row: { extra_json: unknown; data_org: string | null }): Record<string, unknown> | undefined {
  let extra: unknown = row.extra_json;
  if (typeof extra === "string") {
    try {
      extra = JSON.parse(extra);
    } catch {
      return undefined;
    }
  }
  const dataAsOf = (extra as { dataAsOf?: unknown } | null)?.dataAsOf;
  if (typeof dataAsOf !== "string" || !dataAsOf) return undefined;
  return row.data_org ? { dataAsOf, dataOrg: row.data_org } : { dataAsOf };
}

export interface NearbyTypeTask {
  key: string;
  label: string;
  emoji: string;
  run: () => Promise<NearbyItem[]>;
}

export interface NearbyTypeResult {
  key: string;
  label: string;
  emoji: string;
  status: "ok" | "error";
  items: NearbyItem[];
  /** Only set when status is "error" — a short message, never a raw stack trace. */
  error?: string;
}

const errorMessage = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason));

/** Runs every task concurrently; one task rejecting only turns its own result into status "error" with an empty items list. */
export async function aggregateNearbyTypes(tasks: NearbyTypeTask[]): Promise<NearbyTypeResult[]> {
  const settled = await Promise.allSettled(tasks.map((task) => task.run()));

  return tasks.map((task, index) => {
    const outcome = settled[index];
    if (outcome.status === "fulfilled") {
      return { key: task.key, label: task.label, emoji: task.emoji, status: "ok" as const, items: outcome.value };
    }
    return {
      key: task.key,
      label: task.label,
      emoji: task.emoji,
      status: "error" as const,
      items: [],
      error: errorMessage(outcome.reason),
    };
  });
}
