import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpRequest } from "@/lib/server/net/httpClient";
import { decodeBig5, normalizeAddress, parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import {
  buildSmokingCessationSourceId,
  smokingDispensingOnlyFlag,
  smokingEducationFlag,
  smokingMedicationFlag,
  todayDataAsOf,
} from "@/lib/server/facilities/sources/smokingCessationCountyShared";

/**
 * 臺北市「特約戒菸機構」(data.taipei 121898, issue #572, parent #562) — one of
 * the 6 county sources that batch-replace the 臺北市 slice of the national
 * baseline (hpaSmokingCessation.ts, #569) with this more current city list.
 * CSV, **Big5-encoded** (confirmed live 2026-10-14: response Content-Type is
 * `text/csv;charset=BIG-5`) — decoded with the same `decodeBig5()` path as
 * every other Big5 source in this codebase, never treated as UTF-8.
 *
 * Confirmed live 2026-10-14 (re-verified fresh for this ticket, not just
 * copied from the spec table): 288 rows, header
 * `醫事機構代碼,層級,院所名稱,電話,分機,地址,可給藥,可衛教,僅調劑` — unchanged from
 * what the ticket documented. This is the only one of the 6 county sources
 * whose CSV carries an explicit 僅調劑 column (106/288 rows have it set);
 * every other county source leaves `extra.smokingDispensingOnly` null rather
 * than inferring it.
 *
 * Not yet verified reachable from the production host — confirm with the
 * admin facilities-sync endpoint (`{"sources":["smoking_cessation_taipei_121898"]}`)
 * before relying on this source's scheduled runs.
 */
const SOURCE_URL =
  "https://data.taipei/api/dataset/4c241d88-c448-4b48-96ce-14865d97807d/resource/e8df6a1e-1062-4fa7-b6e4-82da4a2a2865/download";

export const SMOKING_CESSATION_TAIPEI_SOURCE_KEY = "smoking_cessation_taipei_121898";

interface SmokingCessationTaipeiRawRow {
  醫事機構代碼: string;
  層級: string;
  院所名稱: string;
  電話: string;
  分機: string;
  地址: string;
  可給藥: string;
  可衛教: string;
  僅調劑: string;
}

// Critical-field schema. 院所名稱/地址 are identity-bearing; 層級/電話/可給藥/
// 可衛教/僅調劑 are the remaining fields this ticket's AC calls out, so a
// silent upstream rename of any of them should fail loudly too.
// `.nullable()` (not `.optional()`) so a column entirely missing from every
// row (renamed/removed upstream) fails validation, while one row's
// legitimately blank flag still passes.
export const smokingCessationTaipeiRawSchema = z.object({
  醫事機構代碼: z.string().nullable(),
  層級: z.string().nullable(),
  院所名稱: z.string().nullable(),
  電話: z.string().nullable(),
  分機: z.string().nullable(),
  地址: z.string().nullable(),
  可給藥: z.string().nullable(),
  可衛教: z.string().nullable(),
  僅調劑: z.string().nullable(),
});

export function buildSmokingCessationTaipeiRecords(rawRows: SmokingCessationTaipeiRawRow[], dataAsOf: string): FacilityRecord[] {
  return rawRows
    .filter((r) => r.院所名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(r.地址);
      return {
        facilityType: "smoking_cessation",
        sourceKey: SMOKING_CESSATION_TAIPEI_SOURCE_KEY,
        sourceId: buildSmokingCessationSourceId(r.院所名稱, address),
        name: r.院所名稱,
        address,
        phone: r.電話 ? toHalfwidthDigits(r.電話) + (r.分機 ? ` 分機${toHalfwidthDigits(r.分機)}` : "") : null,
        lat: null,
        lng: null,
        serviceItem: r.層級 || null,
        serviceTime: null,
        dataOrg: "臺北市政府衛生局（data.taipei 121898）",
        extra: {
          smokingMedication: smokingMedicationFlag(r.可給藥),
          smokingEducation: smokingEducationFlag(r.可衛教),
          smokingDispensingOnly: smokingDispensingOnlyFlag(r.僅調劑),
          dataAsOf,
        },
      } satisfies FacilityRecord;
    });
}

export async function fetchSmokingCessationTaipei(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts. Using
  // httpRequest (raw buffer), not httpGetText — this response is Big5, not
  // UTF-8.
  const res = await httpRequest(SOURCE_URL, { timeoutMs: 15000 });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`臺北市戒菸特約機構名冊 (121898) request failed: HTTP ${res.status}`);
  }

  const text = decodeBig5(res.buffer);
  const rawRows = parseCsv(text) as unknown as SmokingCessationTaipeiRawRow[];
  validateImportRows("臺北市戒菸特約機構名冊 (121898)", smokingCessationTaipeiRawSchema, rawRows);

  return buildSmokingCessationTaipeiRecords(rawRows, todayDataAsOf());
}
