import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv, normalizeAddress } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import { isoDateFromYyyymmdd, isExpiredValidity } from "@/lib/server/facilities/sources/babyFriendlyHospitalShared";

// data.gov.tw 121200「臺北市母嬰親善醫療院所」, published by 臺北市政府衛生局.
// CSV, UTF-8 with BOM, confirmed live 2026-10-14: 19 rows, columns
// 項次,行政區代碼,院所名稱,地址,效期 — 效期 is an 8-digit 西元年 YYYYMMDD string
// that genuinely varies per row (2024/2025/2026/2027), so every sync run has
// to re-evaluate which rows are still valid, not just fetch once and cache.
const SOURCE_URL =
  "https://data.taipei/api/dataset/a09451c2-6783-4afe-af16-c97e812549a3/resource/0f5bc745-53a4-48c3-aa2d-947b8291e8a6/download";

interface TaipeiBabyFriendlyRawRow {
  院所名稱: string;
  地址: string;
  效期: string;
}

// Critical-field schema: 院所名稱/地址 are identity-bearing (sourceId depends
// on both), 效期 is the field this whole ticket exists to filter on, so a
// silent upstream rename of any of the three should fail loudly.
export const taipeiBabyFriendlyRawSchema = z.object({
  院所名稱: z.string().nullable(),
  地址: z.string().nullable(),
  效期: z.string().nullable(),
});

export function buildTaipeiBabyFriendlySourceId(name: string, address: string): string {
  return `${name.trim()}|${address.trim()}`.slice(0, 100);
}

/**
 * One confirmed-live row (序號 15, 臺北市立聯合醫院中興院區) ships an address
 * with the leading "臺"/"台" dropped entirely — "北市大同區鄭州路145號" — while
 * every other row already carries a full "台北市"/"臺北市" prefix. Restoring
 * just the missing character (rather than unconditionally prepending
 * "臺北市", which would double the other 18 rows' prefix) matches this
 * dataset's actual failure shape.
 */
export function withTaipeiPrefix(address: string): string {
  if (address.startsWith("臺北市") || address.startsWith("台北市")) return address;
  if (address.startsWith("北市")) return `臺${address}`;
  return `臺北市${address}`;
}

/**
 * Pure row→record mapping, split out from the HTTP fetch so tests can feed
 * it fixture-parsed rows (and a fixed `todayIso`) without any network call.
 * Drops rows missing an identity field, then drops any row whose 效期 has
 * already passed as of `todayIso` (defaults to the real current date).
 */
export function mapTaipeiBabyFriendlyRows(rows: TaipeiBabyFriendlyRawRow[], todayIso?: string): FacilityRecord[] {
  return rows
    .filter((r) => r.院所名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(withTaipeiPrefix(r.地址));
      const validUntil = isoDateFromYyyymmdd(r.效期);
      const record: FacilityRecord = {
        facilityType: "baby_friendly_hospital",
        sourceKey: "baby_friendly_hospital_taipei_121200",
        sourceId: buildTaipeiBabyFriendlySourceId(r.院所名稱, address),
        name: r.院所名稱,
        address,
        phone: null,
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: "臺北市政府衛生局",
        extra: { validUntil },
      };
      return { record, validUntil };
    })
    .filter(({ validUntil }) => !isExpiredValidity(validUntil, todayIso))
    .map(({ record }) => record);
}

export async function fetchBabyFriendlyHospitalTaipei(todayIso?: string): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`Taipei baby-friendly hospitals (121200) request failed: HTTP ${status}`);

  const raw = parseCsv(text) as unknown as TaipeiBabyFriendlyRawRow[];
  validateImportRows("Taipei baby-friendly hospitals (121200)", taipeiBabyFriendlyRawSchema, raw);

  return mapTaipeiBabyFriendlyRows(raw, todayIso);
}
