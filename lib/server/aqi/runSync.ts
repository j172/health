import { fetchAqiSites } from "@/lib/server/aqi/fetchAqi";
import { upsertAqiReadings } from "@/lib/server/aqi/queries";

export interface AqiSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

export async function runAqiSync(): Promise<AqiSyncResult> {
  try {
    const sites = await fetchAqiSites();
    const { inserted, updated } = await upsertAqiReadings(sites);
    return { fetched: sites.length, inserted, updated, error: null };
  } catch (error) {
    return { fetched: 0, inserted: 0, updated: 0, error: error instanceof Error ? error.message : "Unknown sync error" };
  }
}
