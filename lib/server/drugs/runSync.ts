import { upsertDrugs } from "@/lib/server/drugs/queries";
import { fetchTfdaDrugAppearance } from "@/lib/server/drugs/sources/tfdaDrugAppearance";
import { runSource } from "@/lib/server/sync/runSource";

export interface DrugSyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

export async function runDrugSync(): Promise<DrugSyncResult[]> {
  return [
    await runSource("tfda_drug_appearance", { fetched: 0, inserted: 0, updated: 0 }, async () => {
      const records = await fetchTfdaDrugAppearance();
      const { inserted, updated } = await upsertDrugs(records);
      return { fetched: records.length, inserted, updated };
    }),
  ];
}
