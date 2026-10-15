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
 * 臺南市「特約戒菸機構」名冊 (data.tainan.gov.tw 140122, issue #572, parent
 * #562) — batch-replaces the 臺南市 slice of the national baseline
 * (hpaSmokingCessation.ts, #569). CSV. Re-verified fresh 2026-10-14: 183
 * rows (matches the ticket's count).
 *
 * **Two differences from the ticket's table, found during re-verification**:
 *   1. The real header is `Seq,機構代碼,機構層級,機構名稱,市話,分機,縣市別代碼,
 *      地址-行政區域代碼,地址-村里,地址-街路門牌,給藥,衛教,緯度,經度` — it DOES
 *      carry real `緯度`/`經度` columns, populated on every one of the 183
 *      rows (confirmed, not a sampling fluke), which the ticket's table
 *      didn't mention. This source therefore skips the geocode-backfill
 *      batch entirely and uses its own coordinates directly — same
 *      `地址-行政區域代碼`/`地址-村里`/`地址-街路門牌` + 緯度/經度 shape, and the
 *      same "don't resolve 地址-行政區域代碼, just prepend 臺南市+村里" approach,
 *      as the sibling source babyFriendlyHospitalTainan.ts (#614) already
 *      established for this same county's open-data convention — no district
 *      name ends up in the stored address (an existing, accepted limitation
 *      of this convention, not new here).
 *   2. The raw file's bytes carry a UTF-8 BOM not just at the very start but
 *      a SECOND one immediately after the first column's comma (`...Seq,
 *      <BOM>機構代碼...`) — confirmed on the raw buffer. Checked whether this
 *      corrupts the second header cell — it doesn't: `csv.ts`'s shared
 *      `parseCsv()` `.trim()`s every header cell, and JS's `String.trim()`
 *      treats U+FEFF as whitespace (it's in ECMA-262's WhiteSpace
 *      production), so the embedded BOM is stripped from `機構代碼`'s header
 *      cell anyway (same finding as smokingCessationTaichung.ts's double
 *      leading BOM) — no special handling needed here.
 */
const SOURCE_URL = "https://data.tainan.gov.tw/File/ResourceCsvDownload/aa1335a9-b794-48f8-8243-0cf42413ffc4";

export const SMOKING_CESSATION_TAINAN_SOURCE_KEY = "smoking_cessation_tainan_140122";

interface SmokingCessationTainanRawRow {
  機構層級: string;
  機構名稱: string;
  市話: string;
  "地址-村里": string;
  "地址-街路門牌": string;
  給藥: string;
  衛教: string;
  緯度: string;
  經度: string;
}

export const smokingCessationTainanRawSchema = z.object({
  機構層級: z.string().nullable(),
  機構名稱: z.string().nullable(),
  市話: z.string().nullable(),
  "地址-街路門牌": z.string().nullable(),
  給藥: z.string().nullable(),
  衛教: z.string().nullable(),
  緯度: z.string().nullable(),
  經度: z.string().nullable(),
});

/** Parses a decimal-degree coordinate string. Returns null (not NaN/0) for blank/unparseable input. */
function parseCoordinate(raw: string | undefined | null): number | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : null;
}

export function buildSmokingCessationTainanRecords(rawRows: SmokingCessationTainanRawRow[], dataAsOf: string): FacilityRecord[] {
  return rawRows
    .filter((r) => r.機構名稱 && r["地址-街路門牌"])
    .map((r) => {
      const village = (r["地址-村里"] || "").trim();
      const address = normalizeAddress(`臺南市${village}${r["地址-街路門牌"]}`);
      return {
        facilityType: "smoking_cessation",
        sourceKey: SMOKING_CESSATION_TAINAN_SOURCE_KEY,
        sourceId: buildSmokingCessationSourceId(r.機構名稱, address),
        name: r.機構名稱,
        address,
        phone: r.市話 ? toHalfwidthDigits(r.市話) : null,
        lat: parseCoordinate(r.緯度),
        lng: parseCoordinate(r.經度),
        serviceItem: r.機構層級 || null,
        serviceTime: null,
        dataOrg: "臺南市政府衛生局（data.tainan.gov.tw 140122）",
        extra: {
          smokingMedication: smokingMedicationFlag(r.給藥),
          smokingEducation: smokingEducationFlag(r.衛教),
          smokingDispensingOnly: null,
          dataAsOf,
        },
      } satisfies FacilityRecord;
    });
}

export async function fetchSmokingCessationTainan(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`臺南市戒菸特約機構名冊 (140122) request failed: HTTP ${status}`);

  // See module comment: this file's real bytes carry an embedded BOM
  // mid-header, but parseCsv()'s header-cell .trim() already absorbs it.
  const rawRows = parseCsv(text) as unknown as SmokingCessationTainanRawRow[];
  validateImportRows("臺南市戒菸特約機構名冊 (140122)", smokingCessationTainanRawSchema, rawRows);

  return buildSmokingCessationTainanRecords(rawRows, todayDataAsOf());
}
