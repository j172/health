import { upsertFacilities, type FacilityRecord } from "@/lib/server/facilities/queries";
import { fetchKcgLongTermCareHome } from "@/lib/server/facilities/sources/kcgLongTermCareHome";
import { fetchTfdaPharmacies } from "@/lib/server/facilities/sources/tfdaPharmacies";

export interface FacilitySyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

// Registry of facility sources — add one entry per source as they're wired up
// (drugs, health-checks, etc.), each behind its own fetch function.
const SOURCES: { key: string; fetch: () => Promise<FacilityRecord[]> }[] = [
  { key: "kcg_home_care", fetch: fetchKcgLongTermCareHome },
  { key: "tfda_pharmacy", fetch: fetchTfdaPharmacies },
];

export async function runFacilitySync(): Promise<FacilitySyncResult[]> {
  const results: FacilitySyncResult[] = [];

  for (const source of SOURCES) {
    try {
      const records = await source.fetch();
      const { inserted, updated } = await upsertFacilities(records);
      results.push({ sourceKey: source.key, fetched: records.length, inserted, updated, error: null });
    } catch (error) {
      results.push({
        sourceKey: source.key,
        fetched: 0,
        inserted: 0,
        updated: 0,
        error: error instanceof Error ? error.message : "Unknown sync error",
      });
    }
  }

  return results;
}
