import { normalizeAddress } from "@/lib/server/facilities/csv";

/**
 * Shared helpers for the childcare-center facility family (issue #601, parent
 * #599) — `taipeiChildcare.ts` and `ntpcChildcare.ts` both depend on these so
 * the sourceId rule and the Taipei private/準公共 dedupe key stay identical
 * across every source in the family, and so later county tickets (六都 +
 * 新竹縣市/彰化/嘉義市, per #599's "後續縣市票直接套用同一套模式") can reuse
 * them without re-deriving the same logic per county.
 */

/** 戶政司行政區域代碼 for the two counties this ticket covers. */
export const CHILDCARE_COUNTY_CODE = {
  taipei: "63000",
  newTaipei: "65000",
} as const;

/** The 4-value `extra_json.category` enum for `childcare_center` rows (issue #601 AC). */
export const CHILDCARE_CATEGORY = {
  PUBLIC_PRIVATE: "公辦民營",
  COMMUNITY: "社區公共托育家園",
  QUASI_PUBLIC: "準公共",
  PRIVATE: "私立",
} as const;

/** Strips bracketed annotations (e.g. "(委託○○協會經營管理)") and whitespace from an institution name, for identity comparisons only — never for the displayed `name`. */
export function normalizeInstitutionName(raw: string): string {
  return raw.trim().replace(/[（(][^）)]*[）)]/g, "").replace(/\s+/g, "");
}

/**
 * sourceId rule for every childcare_center/home_childcare_center source:
 * county code + normalized institution name + normalized address — never a
 * dataset ID or year, since some counties' dataset URLs/IDs change yearly
 * and baking one into the identity key would silently create duplicate rows
 * on the next year's re-sync (the exact failure mode #601's acceptance
 * criteria calls out).
 */
export function buildChildcareSourceId(countyCode: string, name: string, normalizedAddress: string | null): string {
  return `${countyCode}|${normalizeInstitutionName(name)}|${normalizedAddress || ""}`.slice(0, 100);
}

/**
 * Strips a trailing floor marker (e.g. "1樓", "1、2樓", "2樓之1") from an
 * already fully-normalized (`normalizeAddress`) address — used ONLY to build
 * the Taipei 私立/準公共 dedupe comparison key below, never for the address
 * actually stored on the row. Confirmed live 2026-10-14: of the 215 準公共
 * rows, 113 refer to the same institution as a row in the 私立 table — 102
 * match on name+address exactly, and 11 more match on name but differ only
 * because the 準公共 table omits the floor the 私立 table keeps (e.g.
 * "...24號" vs "...24號1樓"). One further name match has a genuinely
 * different house number between the two tables (likely a data error on one
 * side) and is deliberately left unmerged — merging it would risk discarding
 * a real, distinct address with no way to tell which side is correct.
 */
export function stripFloorForDedupe(address: string): string {
  return address.replace(/[\d]+(?:[、,，][\d]+)*(?:之[\d]+)?樓(?:之[\d]+)?\s*$/, "").trim();
}

/** Dedupe comparison key for the Taipei 私立/準公共 overlap — normalized name + floor-insensitive normalized address. */
export function buildChildcareDedupeKey(name: string, rawAddress: string): string {
  return `${normalizeInstitutionName(name)}|${stripFloorForDedupe(normalizeAddress(rawAddress))}`;
}

/**
 * Today's date (UTC, `YYYY-MM-DD`), stamped onto every row synced in a given
 * run as `extra_json.dataAsOf` — labels which day *this site* captured that
 * county's childcare snapshot (issue #601 AC's "各縣市資料日期標示"). Not the
 * upstream government portal's own "最後更新" metadata — data.taipei/
 * data.ntpc.gov.tw don't expose a per-resource update date in a form that's
 * safe to cache across syncs, and a stale hardcoded date would be worse than
 * no date at all.
 */
export function todayDataAsOf(): string {
  return new Date().toISOString().slice(0, 10);
}
