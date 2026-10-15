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
 * 臺中市「特約戒菸機構」名冊 (newdatacenter.taichung.gov.tw 81720, issue #572,
 * parent #562) — batch-replaces the 臺中市 slice of the national baseline
 * (hpaSmokingCessation.ts, #569). CSV. Re-verified fresh 2026-10-14: 311
 * rows, header `序號,醫事機構代碼,機構層級,機構名稱,電話,機構地址,給藥,衛教` —
 * unchanged from the ticket's table.
 *
 * **Found during re-verification, not in the ticket's table**: this file's
 * bytes start with TWO consecutive UTF-8 BOMs (`EF BB BF EF BB BF`), not one
 * — confirmed on the raw buffer, not a decoding artifact. Checked whether
 * this corrupts the header (`csv.ts`'s shared `parseCsv()` only strips a
 * single *leading* BOM via regex before splitting into cells) — it doesn't:
 * `parseCsv()` also `.trim()`s every header cell, and JS's `String.trim()`
 * treats U+FEFF as whitespace (it's in ECMA-262's WhiteSpace production), so
 * the second BOM is stripped from the `序號` header cell anyway. No special
 * handling needed here; documented so a future reader doesn't "fix" a
 * non-bug.
 */
const SOURCE_URL = "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=3c195fed-5b29-4333-aa24-9e93e1d851fb";

export const SMOKING_CESSATION_TAICHUNG_SOURCE_KEY = "smoking_cessation_taichung_81720";

interface SmokingCessationTaichungRawRow {
  機構層級: string;
  機構名稱: string;
  電話: string;
  機構地址: string;
  給藥: string;
  衛教: string;
}

export const smokingCessationTaichungRawSchema = z.object({
  機構層級: z.string().nullable(),
  機構名稱: z.string().nullable(),
  電話: z.string().nullable(),
  機構地址: z.string().nullable(),
  給藥: z.string().nullable(),
  衛教: z.string().nullable(),
});

export function buildSmokingCessationTaichungRecords(rawRows: SmokingCessationTaichungRawRow[], dataAsOf: string): FacilityRecord[] {
  return rawRows
    .filter((r) => r.機構名稱 && r.機構地址)
    .map((r) => {
      const address = normalizeAddress(r.機構地址);
      return {
        facilityType: "smoking_cessation",
        sourceKey: SMOKING_CESSATION_TAICHUNG_SOURCE_KEY,
        sourceId: buildSmokingCessationSourceId(r.機構名稱, address),
        name: r.機構名稱,
        address,
        phone: r.電話 ? toHalfwidthDigits(r.電話) : null,
        lat: null,
        lng: null,
        serviceItem: r.機構層級 || null,
        serviceTime: null,
        dataOrg: "臺中市政府衛生局（newdatacenter.taichung.gov.tw 81720）",
        extra: {
          smokingMedication: smokingMedicationFlag(r.給藥),
          smokingEducation: smokingEducationFlag(r.衛教),
          smokingDispensingOnly: null,
          dataAsOf,
        },
      } satisfies FacilityRecord;
    });
}

export async function fetchSmokingCessationTaichung(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`臺中市戒菸特約機構名冊 (81720) request failed: HTTP ${status}`);

  // See module comment: this file's real bytes carry a double UTF-8 BOM,
  // but parseCsv()'s header-cell .trim() already absorbs it — no extra
  // stripping needed.
  const rawRows = parseCsv(text) as unknown as SmokingCessationTaichungRawRow[];
  validateImportRows("臺中市戒菸特約機構名冊 (81720)", smokingCessationTaichungRawSchema, rawRows);

  return buildSmokingCessationTaichungRecords(rawRows, todayDataAsOf());
}
