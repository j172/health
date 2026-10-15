import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import {
  buildSmokingCessationSourceId,
  smokingEducationFlag,
  smokingMedicationFlag,
  todayDataAsOf,
} from "@/lib/server/facilities/sources/smokingCessationCountyShared";

/**
 * 高雄市「特約戒菸機構」名冊 (data.kcg.gov.tw 87259, issue #572, parent #562) —
 * batch-replaces the 高雄市 slice of the national baseline
 * (hpaSmokingCessation.ts, #569). CSV. Re-verified fresh 2026-10-14: 499
 * rows (matches the ticket's count), header
 * `Seq,序號,醫事機構,醫事機構名稱,市話,区號,地址,給藥,衛教` — the ticket's table
 * paraphrased this as "電話,區碼,地址,給藥,衛教"; the real column names are
 * `市話`/`区號` (simplified-looking 区, not 區— confirmed in the live
 * header), kept exactly as the upstream file spells them since neither is
 * identity-bearing or used downstream (`地址` already carries the full
 * "高雄市○○區..." string on its own, so 区號's numeric county/district code
 * is never needed here). `醫事機構` is this county's category column (層級
 * equivalent — e.g. 藥局/診所/牙科診所).
 */
const SOURCE_URL = "https://data.kcg.gov.tw/File/DirectDownload/111621ba-db29-4fe2-b310-a85125804e27";

export const SMOKING_CESSATION_KAOHSIUNG_SOURCE_KEY = "smoking_cessation_kaohsiung_87259";

interface SmokingCessationKaohsiungRawRow {
  醫事機構: string;
  醫事機構名稱: string;
  市話: string;
  地址: string;
  給藥: string;
  衛教: string;
}

export const smokingCessationKaohsiungRawSchema = z.object({
  醫事機構: z.string().nullable(),
  醫事機構名稱: z.string().nullable(),
  市話: z.string().nullable(),
  地址: z.string().nullable(),
  給藥: z.string().nullable(),
  衛教: z.string().nullable(),
});

export function buildSmokingCessationKaohsiungRecords(rawRows: SmokingCessationKaohsiungRawRow[], dataAsOf: string): FacilityRecord[] {
  return rawRows
    .filter((r) => r.醫事機構名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(r.地址);
      return {
        facilityType: "smoking_cessation",
        sourceKey: SMOKING_CESSATION_KAOHSIUNG_SOURCE_KEY,
        sourceId: buildSmokingCessationSourceId(r.醫事機構名稱, address),
        name: r.醫事機構名稱,
        address,
        phone: r.市話 ? toHalfwidthDigits(r.市話) : null,
        lat: null,
        lng: null,
        serviceItem: r.醫事機構 || null,
        serviceTime: null,
        dataOrg: "高雄市政府衛生局（data.kcg.gov.tw 87259）",
        extra: {
          smokingMedication: smokingMedicationFlag(r.給藥),
          smokingEducation: smokingEducationFlag(r.衛教),
          smokingDispensingOnly: null,
          dataAsOf,
        },
      } satisfies FacilityRecord;
    });
}

export async function fetchSmokingCessationKaohsiung(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`高雄市戒菸特約機構名冊 (87259) request failed: HTTP ${status}`);

  const rawRows = parseCsv(text) as unknown as SmokingCessationKaohsiungRawRow[];
  validateImportRows("高雄市戒菸特約機構名冊 (87259)", smokingCessationKaohsiungRawSchema, rawRows);

  return buildSmokingCessationKaohsiungRecords(rawRows, todayDataAsOf());
}
