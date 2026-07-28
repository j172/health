import { upsertDrugs } from "@/lib/server/drugs/queries";
import { fetchTfdaDrugAppearance } from "@/lib/server/drugs/sources/tfdaDrugAppearance";

export interface DrugSyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

export async function runDrugSync(): Promise<DrugSyncResult[]> {
  try {
    const records = await fetchTfdaDrugAppearance();
    const { inserted, updated } = await upsertDrugs(records);
    return [{ sourceKey: "tfda_drug_appearance", fetched: records.length, inserted, updated, error: null }];
  } catch (error) {
    return [{ sourceKey: "tfda_drug_appearance", fetched: 0, inserted: 0, updated: 0, error: error instanceof Error ? error.message : "Unknown sync error" }];
  }
}
