import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpRequest } from "@/lib/server/net/httpClient";
import { parseCsv, normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { decodeCsvBuffer } from "@/lib/server/power/csvEncoding";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import { isoDateFromRocYearEnd, isExpiredValidity } from "@/lib/server/facilities/sources/babyFriendlyHospitalShared";

// data.gov.tw 30882「彰化縣母嬰親善醫療院所」, published by 彰化縣衛生局.
// CSV, declared encoding Big5 (confirmed live 2026-10-14) — `decodeCsvBuffer`
// tries UTF-8 first and only falls back to Big5 on a decode failure, so this
// stays correct even if the county ever switches the export to UTF-8
// without telling anyone. 5 rows, columns
// 序號,醫事機構名稱,郵遞區號,地址,市話,效期 — 效期 is the free-text "NNN年底"
// ROC-year-end format (e.g. "116年底"), NOT the YYYYMMDD 西元年 format
// Taipei's 121200 uses, confirmed by fetching a live sample rather than
// assumed. All 5 rows already carry a full "彰化縣"/county-level address
// prefix, unlike some other counties' exports.
const SOURCE_URL = "https://ms1.chshb.gov.tw/df/b95flv8mdr7lbrzj7h9b3zlfq2xzjt";

interface ChanghuaBabyFriendlyRawRow {
  醫事機構名稱: string;
  地址: string;
  市話: string;
  效期: string;
}

// Critical-field schema: 醫事機構名稱/地址 are identity-bearing (sourceId
// depends on both); 效期 is the field this ticket exists to filter on.
export const changhuaBabyFriendlyRawSchema = z.object({
  醫事機構名稱: z.string().nullable(),
  地址: z.string().nullable(),
  效期: z.string().nullable(),
});

export function buildChanghuaBabyFriendlySourceId(name: string, address: string): string {
  return `${name.trim()}|${address.trim()}`.slice(0, 100);
}

/**
 * Pure row→record mapping, split out from the HTTP fetch so tests can feed
 * it fixture-parsed rows (and a fixed `todayIso`) without any network call.
 * Drops any row whose 效期 ("NNN年底") has already passed as of `todayIso`
 * (defaults to the real current date).
 */
export function mapChanghuaBabyFriendlyRows(rows: ChanghuaBabyFriendlyRawRow[], todayIso?: string): FacilityRecord[] {
  return rows
    .filter((r) => r.醫事機構名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(r.地址);
      const validUntil = isoDateFromRocYearEnd(r.效期);
      const record: FacilityRecord = {
        facilityType: "baby_friendly_hospital",
        sourceKey: "baby_friendly_hospital_changhua_30882",
        sourceId: buildChanghuaBabyFriendlySourceId(r.醫事機構名稱, address),
        name: r.醫事機構名稱,
        address,
        phone: r.市話 ? toHalfwidthDigits(r.市話) : null,
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: "彰化縣衛生局",
        extra: { validUntil },
      };
      return { record, validUntil };
    })
    .filter(({ validUntil }) => !isExpiredValidity(validUntil, todayIso))
    .map(({ record }) => record);
}

export async function fetchBabyFriendlyHospitalChanghua(todayIso?: string): Promise<FacilityRecord[]> {
  // httpRequest (not httpGetText) so we get the raw Buffer — httpGetText
  // always decodes as UTF-8, which would mangle this Big5 CSV.
  const response = await httpRequest(SOURCE_URL);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Changhua baby-friendly hospitals (30882) request failed: HTTP ${response.status}`);
  }
  const text = decodeCsvBuffer(response.buffer);

  const raw = parseCsv(text) as unknown as ChanghuaBabyFriendlyRawRow[];
  validateImportRows("Changhua baby-friendly hospitals (30882)", changhuaBabyFriendlyRawSchema, raw);

  return mapChanghuaBabyFriendlyRows(raw, todayIso);
}
