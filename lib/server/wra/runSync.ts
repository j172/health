import { fetchWraDroughtAlerts } from "@/lib/server/wra/sources/droughtAlerts";
import { upsertWraDroughtAlerts, pickLatestPerReservoir, upsertWraNewsItems } from "@/lib/server/wra/queries";
import { runSource } from "@/lib/server/sync/runSource";

export interface WraSyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

const ZERO_COUNTS = { fetched: 0, inserted: 0, updated: 0 };
const WRA_ERROR_FALLBACK = "Unknown WRA sync error";

// Mirrors lib/server/cwa/runSync.ts's shape (fetch -> upsert raw table ->
// derive the widget-facing rows), with a single dataset in scope for now —
// see docs/specs/phase5-wra-drought-alerts.md.
export async function runWraDroughtSync(): Promise<WraSyncResult[]> {
  return [
    await runSource(
      "wra_drought_alerts",
      ZERO_COUNTS,
      async () => {
        const records = await fetchWraDroughtAlerts();
        await upsertWraDroughtAlerts(records);

        const latest = pickLatestPerReservoir(records);
        const { inserted, updated } = await upsertWraNewsItems(latest);
        return { fetched: records.length, inserted, updated };
      },
      WRA_ERROR_FALLBACK,
    ),
  ];
}
