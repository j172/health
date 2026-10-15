import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import {
  buildSmokingCessationSourceId,
  todayDataAsOf,
} from "@/lib/server/facilities/sources/smokingCessationCountyShared";

/**
 * 新北市「特約戒菸機構」名冊，兩個獨立 data.ntpc.gov.tw 資料集 (issue #572,
 * parent #562) — 124244 (一般院所) 和 125915 (牙醫診所)。Both batch-replace the
 * 新北市 slice of the national baseline (hpaSmokingCessation.ts, #569) — see
 * runSync.ts's `replaceBaselineForCounty` wiring, shared by both of these
 * sources (either one's delete is a no-op once the other has already run;
 * see smokingCessationCountyShared.ts's module comment for why both carry
 * the same county-match list rather than splitting the delete between them).
 *
 * CSV, UTF-8. Re-verified fresh 2026-10-14 for this ticket (not just copied
 * from the spec table): 124244 has 636 rows, 125915 has 244 rows, headers
 * `no,name,type,telephone,postal_code,district,address,twd97x_longitude,
 * twd97y_latitude,wgs84ax_longitude,wgs84ay_latitude` (125915: `postalcode`,
 * no underscore — the one header difference between the two, on a field
 * neither source actually uses). `address` already carries the full
 * "新北市○○區..." string, so unlike several other sources in this family no
 * district prefix needs to be prepended.
 *
 * **Correction to the spec table**: it describes these two sources as
 * "自帶 TWD97 和 WGS84 座標". Re-checked live 2026-10-14 — every single row in
 * both datasets currently has all 4 coordinate columns blank (confirmed
 * against all 636 + 244 rows, not a sampling fluke). `parseCoordinate()`
 * below still reads wgs84ax_longitude/wgs84ay_latitude when present (so a
 * future re-population upstream is picked up automatically without a code
 * change), but as of this sync both sources fall through to the usual
 * geocode-backfill batch like every other address-only source here — see
 * geocodeBatch.ts's SOURCES_IN_PRIORITY, which this ticket adds both keys to.
 *
 * Neither CSV has a 給藥/衛教/僅調劑 column at all (confirmed live) — every row
 * from either source carries `extra.smokingMedication`/`smokingEducation`/
 * `smokingDispensingOnly` as null, never guessed.
 *
 * Not yet verified reachable from the production host — confirm with the
 * admin facilities-sync endpoint before relying on these sources' scheduled
 * runs.
 */
const SOURCE_URL_GENERAL = "https://data.ntpc.gov.tw/api/datasets/1a03a6ed-9ca2-4d8e-a2be-84c70c659349/csv/file";
const SOURCE_URL_DENTAL = "https://data.ntpc.gov.tw/api/datasets/425e3fcd-f467-4cac-b212-acd0bb604bd2/csv/file";

export const SMOKING_CESSATION_NTPC_SOURCE_KEY = "smoking_cessation_ntpc_124244";
export const SMOKING_CESSATION_NTPC_DENTAL_SOURCE_KEY = "smoking_cessation_ntpc_dental_125915";

interface SmokingCessationNtpcRawRow {
  name: string;
  type: string;
  telephone: string;
  district: string;
  address: string;
  wgs84ax_longitude: string;
  wgs84ay_latitude: string;
}

export const smokingCessationNtpcRawSchema = z.object({
  name: z.string().nullable(),
  type: z.string().nullable(),
  telephone: z.string().nullable(),
  district: z.string().nullable(),
  address: z.string().nullable(),
  wgs84ax_longitude: z.string().nullable(),
  wgs84ay_latitude: z.string().nullable(),
});

/** Parses a decimal-degree coordinate string. Returns null (not NaN/0) for blank/unparseable input, so a missing coordinate never silently becomes "equator, prime meridian". */
function parseCoordinate(raw: string | undefined | null): number | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : null;
}

export function buildSmokingCessationNtpcRecords(
  rawRows: SmokingCessationNtpcRawRow[],
  sourceKey: string,
  dataOrg: string,
  dataAsOf: string,
): FacilityRecord[] {
  return rawRows
    .filter((r) => r.name && r.address)
    .map((r) => {
      const address = normalizeAddress(r.address);
      return {
        facilityType: "smoking_cessation",
        sourceKey,
        sourceId: buildSmokingCessationSourceId(r.name, address),
        name: r.name,
        address,
        phone: r.telephone ? toHalfwidthDigits(r.telephone) : null,
        lat: parseCoordinate(r.wgs84ay_latitude),
        lng: parseCoordinate(r.wgs84ax_longitude),
        serviceItem: r.type || null,
        serviceTime: null,
        dataOrg,
        extra: {
          smokingMedication: null,
          smokingEducation: null,
          smokingDispensingOnly: null,
          dataAsOf,
        },
      } satisfies FacilityRecord;
    });
}

async function fetchSmokingCessationNtpcCsv(url: string, label: string): Promise<SmokingCessationNtpcRawRow[]> {
  // Deliberately not the global fetch() — see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(url);
  if (status < 200 || status >= 300) throw new Error(`${label} request failed: HTTP ${status}`);

  const rawRows = parseCsv(text) as unknown as SmokingCessationNtpcRawRow[];
  validateImportRows(label, smokingCessationNtpcRawSchema, rawRows);
  return rawRows;
}

export async function fetchSmokingCessationNtpc(): Promise<FacilityRecord[]> {
  const rawRows = await fetchSmokingCessationNtpcCsv(SOURCE_URL_GENERAL, "新北市戒菸特約機構名冊 (124244)");
  return buildSmokingCessationNtpcRecords(
    rawRows,
    SMOKING_CESSATION_NTPC_SOURCE_KEY,
    "新北市政府衛生局（data.ntpc.gov.tw 124244）",
    todayDataAsOf(),
  );
}

export async function fetchSmokingCessationNtpcDental(): Promise<FacilityRecord[]> {
  const rawRows = await fetchSmokingCessationNtpcCsv(SOURCE_URL_DENTAL, "新北市戒菸特約牙醫診所名冊 (125915)");
  return buildSmokingCessationNtpcRecords(
    rawRows,
    SMOKING_CESSATION_NTPC_DENTAL_SOURCE_KEY,
    "新北市政府衛生局（data.ntpc.gov.tw 125915）",
    todayDataAsOf(),
  );
}
