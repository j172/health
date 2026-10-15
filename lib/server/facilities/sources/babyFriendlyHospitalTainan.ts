import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";

// data.gov.tw 150985「臺南市母嬰親善醫療院所」, published by 臺南市政府衛生局.
// JSON (not CSV — this county's OpenAPI wraps the rows in
// {contentType,isImage,size,data:[...]}), confirmed live 2026-10-14: 11
// rows, columns Seq,院所名稱,縣市別代碼,地址-行政區域代碼,地址-村里,地址-街路門牌,
// 市話,緯度,經度. No validity-date column, so no expiry filtering applies —
// but unlike every other county here, this export already ships real
// lat/lng per row, so these rows skip the usual geocode-backfill path
// entirely.
const SOURCE_URL = "https://soa.tainan.gov.tw/Api/Service/Get/8bafa373-c2b9-433b-9d3f-4b96845ee66f";

interface TainanBabyFriendlyRawRow {
  院所名稱: string;
  "地址-村里": string;
  "地址-街路門牌": string;
  市話: string;
  緯度: string;
  經度: string;
}

interface TainanBabyFriendlyResponse {
  data: TainanBabyFriendlyRawRow[];
}

// Critical-field schema: 院所名稱/地址-街路門牌 are identity-bearing (sourceId
// and the address both depend on them); 緯度/經度 are this source's one
// genuine differentiator (real coordinates, no geocode backfill needed), so
// an upstream rename of any of the four should fail loudly rather than
// quietly dropping back to ungeocoded rows.
export const tainanBabyFriendlyRawSchema = z.object({
  院所名稱: z.string().nullable(),
  "地址-街路門牌": z.string().nullable(),
  緯度: z.string().nullable(),
  經度: z.string().nullable(),
});

export function buildTainanBabyFriendlySourceId(name: string, address: string): string {
  return `${name.trim()}|${address.trim()}`.slice(0, 100);
}

/** Parses a decimal-degree lat/lng string. Returns null (not NaN/0) for anything unparseable, so a bad coordinate never silently becomes "equator, prime meridian". */
function parseCoordinate(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure row→record mapping, split out from the HTTP fetch so tests can feed
 * it fixture-parsed rows without any network call. No expiry filtering —
 * this export has no validity-date column.
 */
export function mapTainanBabyFriendlyRows(rows: TainanBabyFriendlyRawRow[]): FacilityRecord[] {
  return rows
    .filter((r) => r.院所名稱 && r["地址-街路門牌"])
    .map((r) => {
      const village = (r["地址-村里"] || "").trim();
      const address = normalizeAddress(`臺南市${village}${r["地址-街路門牌"]}`);
      return {
        facilityType: "baby_friendly_hospital",
        sourceKey: "baby_friendly_hospital_tainan_150985",
        sourceId: buildTainanBabyFriendlySourceId(r.院所名稱, address),
        name: r.院所名稱,
        address,
        phone: r.市話 || null,
        lat: parseCoordinate(r.緯度),
        lng: parseCoordinate(r.經度),
        serviceItem: null,
        serviceTime: null,
        dataOrg: "臺南市政府衛生局",
      } satisfies FacilityRecord;
    });
}

export async function fetchBabyFriendlyHospitalTainan(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`Tainan baby-friendly hospitals (150985) request failed: HTTP ${status}`);

  const parsed = JSON.parse(text) as TainanBabyFriendlyResponse;
  const raw = parsed.data;
  validateImportRows("Tainan baby-friendly hospitals (150985)", tainanBabyFriendlyRawSchema, raw);

  return mapTainanBabyFriendlyRows(raw);
}
