/**
 * Generic per-type failure isolation for the "/nearby" aggregation API
 * (issue #466 acceptance criterion: "任一類型查詢失敗不影響其他類型正常顯示").
 *
 * Deliberately knows nothing about facilities/emergency-rooms/disaster-points
 * — each caller supplies a `run()` closure per type, and this module just
 * runs them all through `Promise.allSettled` and turns each outcome into a
 * uniform ok/error result. Same isolation shape as
 * lib/server/youbike/tdxClient.ts's `fetchAllTdxStations()` (per-city) and
 * lib/server/transit/tdxBusClient.ts (per-county): one type throwing (a
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
