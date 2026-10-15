import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv, normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";

// data.gov.tw 83649「臺中市母嬰親善醫療院所名單」, published by 臺中市政府衛生局.
// CSV, UTF-8 with BOM, confirmed live 2026-10-14: 18 rows, columns
// 縣市別代碼,序號,母嬰親善醫療院所名單,行政區,電話.
//
// This export has no street-level address column at all (only 行政區, the
// district) and no validity-date column — confirmed live, not assumed. The
// address built below is therefore only county+district precision
// ("臺中市霧峰區", not a street address); that's a real gap in what
// Taichung publishes, not a bug in this fetcher. No expiry filtering
// applies since there's no 效期 field to filter on.
const SOURCE_URL = "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=77c7827a-e236-4940-a90e-361a3e874b6c";

interface TaichungBabyFriendlyRawRow {
  母嬰親善醫療院所名單: string;
  行政區: string;
  電話: string;
}

// Critical-field schema: 母嬰親善醫療院所名單 (the institution name) and 行政區
// (the only location info this export carries) are both identity-bearing —
// sourceId and the district-level address both depend on them.
export const taichungBabyFriendlyRawSchema = z.object({
  母嬰親善醫療院所名單: z.string().nullable(),
  行政區: z.string().nullable(),
});

export function buildTaichungBabyFriendlySourceId(name: string, district: string): string {
  return `${name.trim()}|${district.trim()}`.slice(0, 100);
}

/**
 * Pure row→record mapping, split out from the HTTP fetch so tests can feed
 * it fixture-parsed rows without any network call. No expiry filtering —
 * this export has no 效期 column.
 */
export function mapTaichungBabyFriendlyRows(rows: TaichungBabyFriendlyRawRow[]): FacilityRecord[] {
  return rows
    .filter((r) => r.母嬰親善醫療院所名單 && r.行政區)
    .map((r) => {
      const district = r.行政區.trim();
      const address = normalizeAddress(`臺中市${district}`);
      return {
        facilityType: "baby_friendly_hospital",
        sourceKey: "baby_friendly_hospital_taichung_83649",
        sourceId: buildTaichungBabyFriendlySourceId(r.母嬰親善醫療院所名單, district),
        name: r.母嬰親善醫療院所名單,
        address,
        phone: r.電話 ? toHalfwidthDigits(r.電話) : null,
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: "臺中市政府衛生局",
      } satisfies FacilityRecord;
    });
}

export async function fetchBabyFriendlyHospitalTaichung(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`Taichung baby-friendly hospitals (83649) request failed: HTTP ${status}`);

  const raw = parseCsv(text) as unknown as TaichungBabyFriendlyRawRow[];
  validateImportRows("Taichung baby-friendly hospitals (83649)", taichungBabyFriendlyRawSchema, raw);

  return mapTaichungBabyFriendlyRows(raw);
}
