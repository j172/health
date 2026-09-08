import { fetchAqxWideDataset } from "@/lib/server/aqx/fetchAqxWide";
import { fetchAqxNarrowDataset } from "@/lib/server/aqx/fetchAqxNarrow";
import { upsertAqxWideRecords, upsertAqxNarrowRecords } from "@/lib/server/aqx/queries";
import { AQX_WIDE_DATASET_CODES, AQX_NARROW_DATASET_CODES } from "@/lib/server/aqx/datasets";
import { runSource } from "@/lib/server/sync/runSource";

export interface AqxSyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

const ZERO_COUNTS = { fetched: 0, inserted: 0, updated: 0 };

/**
 * Syncs all eight AQX_* datasets from issue #131 in one pass: five "wide"
 * hourly datasets (AQX_P_15/16/17/18/25) and three "narrow" single-reading
 * datasets (AQX_P_318/319/35). Each dataset is wrapped individually in
 * runSource so one dataset's failure (e.g. a transient MOENV 5xx) doesn't
 * block the other seven — same convention as runAqiSync.
 */
export async function runAqxSync(): Promise<AqxSyncResult[]> {
  const results: AqxSyncResult[] = [];

  for (const datasetCode of AQX_WIDE_DATASET_CODES) {
    results.push(
      await runSource(datasetCode, ZERO_COUNTS, async () => {
        const records = await fetchAqxWideDataset(datasetCode);
        const { inserted, updated } = await upsertAqxWideRecords(records);
        return { fetched: records.length, inserted, updated };
      }),
    );
  }

  for (const datasetCode of AQX_NARROW_DATASET_CODES) {
    results.push(
      await runSource(datasetCode, ZERO_COUNTS, async () => {
        const records = await fetchAqxNarrowDataset(datasetCode);
        const { inserted, updated } = await upsertAqxNarrowRecords(records);
        return { fetched: records.length, inserted, updated };
      }),
    );
  }

  return results;
}
