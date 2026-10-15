import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv, normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import { isoDateFromYyyymmdd } from "@/lib/server/facilities/sources/babyFriendlyHospitalShared";

// data.gov.tw 123291「新北市母嬰親善醫療院所認證名單」, published by 新北市政府衛生局.
// CSV, UTF-8 with BOM, confirmed live 2026-10-14: 20 rows, columns
// seqno,hosp_name,hosp_addr,tel,date.
//
// Unlike Taipei's 121200 (where 效期 genuinely varies per row), every single
// one of these 20 rows shares the exact same `date` value ("20260211") —
// confirmed by checking all 20, not just a sample. That's the signature of a
// "this whole list was last confirmed/published on this date" batch stamp,
// not a per-institution accreditation expiry, so it is surfaced as display
// metadata (`dataVerifiedAt`) only and never used to drop a row. Don't
// "fix" this into per-row filtering without re-confirming live that the
// upstream export has actually started varying it.
const SOURCE_URL = "https://data.ntpc.gov.tw/api/datasets/6477c583-d4e0-4e5b-8581-c59f555bf9f2/csv/file";

interface NewTaipeiBabyFriendlyRawRow {
  hosp_name: string;
  hosp_addr: string;
  tel: string;
  date: string;
}

// Critical-field schema: hosp_name/hosp_addr are identity-bearing (sourceId
// depends on both); `date` is kept here too since it's this source's only
// freshness signal (surfaced as dataVerifiedAt) even though it isn't used
// for per-row filtering.
export const newTaipeiBabyFriendlyRawSchema = z.object({
  hosp_name: z.string().nullable(),
  hosp_addr: z.string().nullable(),
  date: z.string().nullable(),
});

export function buildNewTaipeiBabyFriendlySourceId(name: string, address: string): string {
  return `${name.trim()}|${address.trim()}`.slice(0, 100);
}

/**
 * Pure row→record mapping, split out from the HTTP fetch so tests can feed
 * it fixture-parsed rows without any network call. No expiry filtering here
 * — see the module comment above for why `date` is display-only.
 */
export function mapNewTaipeiBabyFriendlyRows(rows: NewTaipeiBabyFriendlyRawRow[]): FacilityRecord[] {
  return rows
    .filter((r) => r.hosp_name && r.hosp_addr)
    .map((r) => {
      const address = normalizeAddress(r.hosp_addr);
      const dataVerifiedAt = isoDateFromYyyymmdd(r.date);
      return {
        facilityType: "baby_friendly_hospital",
        sourceKey: "baby_friendly_hospital_new_taipei_123291",
        sourceId: buildNewTaipeiBabyFriendlySourceId(r.hosp_name, address),
        name: r.hosp_name,
        address,
        phone: r.tel ? toHalfwidthDigits(r.tel) : null,
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: "新北市政府衛生局",
        extra: { dataVerifiedAt },
      } satisfies FacilityRecord;
    });
}

export async function fetchBabyFriendlyHospitalNewTaipei(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`New Taipei baby-friendly hospitals (123291) request failed: HTTP ${status}`);

  const raw = parseCsv(text) as unknown as NewTaipeiBabyFriendlyRawRow[];
  validateImportRows("New Taipei baby-friendly hospitals (123291)", newTaipeiBabyFriendlyRawSchema, raw);

  return mapNewTaipeiBabyFriendlyRows(raw);
}
