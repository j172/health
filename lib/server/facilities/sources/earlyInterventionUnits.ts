import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpRequest } from "@/lib/server/net/httpClient";
import { parseOdsFirstSheet } from "@/lib/server/facilities/ods";
import { normalizeAddress, normalizeUnitName, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";

// data.gov.tw 130229「各縣市早期療育單位一覽表」(衛福部社會及家庭署) — ODS format,
// confirmed live 2026-10-14: 1,339 data rows across all 22 縣市. No coordinates
// of its own; geocoded via the usual facilities-geocode batch pipeline (see
// SOURCES_IN_PRIORITY in lib/server/facilities/geocodeBatch.ts).
const SOURCE_URL =
  "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/130229/%E5%90%84%E7%9B%B4%E8%BD%84%E5%B8%82%E3%80%81%E7%B8%A3(%E5%B8%82)%E6%94%BF%E5%BA%9C%E6%97%A9%E6%9C%9F%E7%99%82%E8%82%B2%E5%96%AE%E4%BD%8D%E5%BD%99%E6%95%B4%E8%A1%A8.ods";

interface EarlyInterventionRawRow {
  縣市: string;
  鄉鎮市區: string;
  單位別: string;
  服務方式: string;
  單位名稱: string;
  地址: string;
  連絡電話: string;
  療育服務內容: string;
  服務時間: string;
}

// Critical-field schema for the raw rows. 縣市/鄉鎮市區/單位名稱/地址 are
// identity-bearing (sourceId and the address-prefix repair below both
// depend on them); 單位別/服務方式 are the two dimensions the tool page
// filters by (issue #613's acceptance criteria), so a silent upstream
// rename of either should fail loudly too. `.nullable()` (not `.optional()`)
// so a column entirely missing from every row (renamed/removed upstream)
// fails validation, while one row's legitimately empty value (e.g. 1/1339
// rows has an empty 單位名稱 — confirmed live) still passes.
export const earlyInterventionRawSchema = z.object({
  縣市: z.string().nullable(),
  鄉鎮市區: z.string().nullable(),
  單位別: z.string().nullable(),
  服務方式: z.string().nullable(),
  單位名稱: z.string().nullable(),
  地址: z.string().nullable(),
});

// 3 literal placeholder values confirmed live 2026-10-14 (172/1339 rows) —
// these are 到宅-only/outreach services with genuinely no fixed address, not
// a missing-data bug. Treated as "no address" (null) rather than passed
// through to geocoding, which would otherwise try (and fail) to resolve
// literal Chinese sentences as street addresses.
const NO_FIXED_LOCATION_VALUES = new Set(["無", "未設置據點", "無服務據點"]);

// ~190/1339 real rows list more than one physical location in one 地址 cell,
// numbered and separated by a full-width semicolon — e.g.
// "1.新北市三芝區中山路1段12號(新北市三芝區衛生所)；2.新北市三芝區育英街22號(三芝國小)"
// (confirmed live). normalizeAddress()'s own "keep only the first when
// multiple full addresses are listed" policy covers comma/及 separators,
// not this dataset's "；"-separated, digit-dot-numbered list shape — handled
// here before handing off to normalizeAddress for its usual halfwidth-digit/
// parenthetical/dedup cleanup.
function takeFirstNumberedLocation(address: string): string {
  return address.split(/[；;]/)[0].replace(/^\s*\d+[.、]\s*/, "");
}

// 13/1339 real rows' 地址 doesn't carry the 縣市/鄉鎮市區 prefix at all
// (confirmed live: a mix of stale pre-2014 county names like "桃園縣", the
// "巿" typo variant of "市", and addresses that start straight at the
// 鄉鎮市區 level, e.g. "彰化市天祥路53號" under 彰化縣) — prepend
// 縣市+鄉鎮市區 so every address is geocodable/displayable on its own, but
// only when it's actually missing (checking both the official and informal
// 臺/台 spelling) to avoid producing a doubled county name.
export function withCountyDistrictPrefix(county: string, district: string, address: string): string {
  if (!address) return `${county}${district}`;
  const informalCounty = county.replace(/^臺/, "台");
  if (address.startsWith(county) || address.startsWith(informalCounty)) return address;
  // Confirmed live: "彰化市天祥路53號" under 縣市=彰化縣/鄉鎮市區=彰化市 — the
  // district name alone (彰化市 is the county seat, itself a 縣轄市) is
  // already present, just missing the county; prepending county+district
  // again here would double the district ("彰化縣彰化市彰化市天祥路...").
  if (district && address.startsWith(district)) return `${county}${address}`;
  return `${county}${district}${address}`;
}

/** Cleans one row's raw 地址 into either a usable, county-prefixed address or null (no fixed location). */
export function cleanEarlyInterventionAddress(county: string, district: string, raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || NO_FIXED_LOCATION_VALUES.has(trimmed)) return null;
  const firstLocation = takeFirstNumberedLocation(trimmed);
  const normalized = normalizeAddress(firstLocation);
  if (!normalized) return null;
  return withCountyDistrictPrefix(county, district, normalized);
}

/** `sourceId` is built from 縣市 + normalized 單位名稱 + address — never the dataset's year/ID (issue #613's explicit requirement, same identity-key-stability rationale as docs/archive/specs/mol-occupational-injury-source-id-migration.md). */
export function buildEarlyInterventionSourceId(county: string, name: string, address?: string | null): string {
  return `${county.trim()}|${normalizeUnitName(name)}|${(address || "").trim()}`.slice(0, 150);
}

export async function fetchEarlyInterventionUnits(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, buffer } = await httpRequest(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`Early-intervention units (130229) request failed: HTTP ${status}`);

  const raw = parseOdsFirstSheet(buffer) as unknown as EarlyInterventionRawRow[];
  validateImportRows("Early-intervention units (130229)", earlyInterventionRawSchema, raw);

  return raw
    .filter((r) => r.縣市 && r.單位名稱)
    .map((r) => {
      const address = cleanEarlyInterventionAddress(r.縣市, r.鄉鎮市區 || "", r.地址);
      return {
        facilityType: "early_intervention_unit",
        sourceKey: "mohw_early_intervention_130229",
        sourceId: buildEarlyInterventionSourceId(r.縣市, r.單位名稱, address),
        name: normalizeUnitName(r.單位名稱),
        address,
        phone: r.連絡電話 ? toHalfwidthDigits(r.連絡電話) : null,
        lat: null,
        lng: null,
        serviceItem: r.單位別 || null,
        serviceTime: r.服務時間 || null,
        dataOrg: "衛生福利部社會及家庭署（data.gov.tw 130229）",
        extra: {
          serviceMethod: r.服務方式 || null,
          serviceContent: r.療育服務內容 || null,
        },
      };
    });
}
