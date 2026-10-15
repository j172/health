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
 * 桃園市「特約戒菸機構」名冊 (opendata.tycg.gov.tw 33872, issue #572, parent
 * #562) — batch-replaces the 桃園市 slice of the national baseline
 * (hpaSmokingCessation.ts, #569). CSV, UTF-8. Header (per the ticket's own
 * table, 2026-10-14 verification): `ROW_NO,機構代碼,機構層級,機構名稱,機構電話,
 * 機構地址,給藥,衛教` — 181 rows.
 *
 * **Not independently re-verified for this ticket**: opendata.tycg.gov.tw
 * was extremely flaky from this session's working network — repeated
 * attempts against both this resource and the bare domain root mostly
 * timed out after the TLS handshake with no HTTP response at all, but one
 * single attempt did get a response: HTTP 200 with an F5-style WAF
 * "Request Rejected... consult with your administrator" block page instead
 * of the CSV, even with a browser User-Agent set. That's at least proof the
 * endpoint itself is alive right now, but not proof this exact resource ID
 * still serves the same CSV — couldn't get past the WAF in this session to
 * confirm. The schema below still validates critical fields and will fail
 * loudly if the real header has actually changed. Coordinator: this
 * source's reachability needs confirming (from a residential network and/or
 * the production host — a residential IP may simply not trip the same WAF
 * rule) before its first real sync — treat the 181-row count and this exact
 * header shape (carried over from the ticket's own table, not re-confirmed
 * here) as unverified until then.
 */
const SOURCE_URL = "https://opendata.tycg.gov.tw/api/dataset/ff49141d-7479-4763-8572-4fcee238cf18/resource/85f8ffdc-b21f-4b6f-b51b-267bf8c305ac/download";

export const SMOKING_CESSATION_TAOYUAN_SOURCE_KEY = "smoking_cessation_taoyuan_33872";

interface SmokingCessationTaoyuanRawRow {
  機構代碼: string;
  機構層級: string;
  機構名稱: string;
  機構電話: string;
  機構地址: string;
  給藥: string;
  衛教: string;
}

export const smokingCessationTaoyuanRawSchema = z.object({
  機構代碼: z.string().nullable(),
  機構層級: z.string().nullable(),
  機構名稱: z.string().nullable(),
  機構電話: z.string().nullable(),
  機構地址: z.string().nullable(),
  給藥: z.string().nullable(),
  衛教: z.string().nullable(),
});

export function buildSmokingCessationTaoyuanRecords(rawRows: SmokingCessationTaoyuanRawRow[], dataAsOf: string): FacilityRecord[] {
  return rawRows
    .filter((r) => r.機構名稱 && r.機構地址)
    .map((r) => {
      const address = normalizeAddress(r.機構地址);
      return {
        facilityType: "smoking_cessation",
        sourceKey: SMOKING_CESSATION_TAOYUAN_SOURCE_KEY,
        sourceId: buildSmokingCessationSourceId(r.機構名稱, address),
        name: r.機構名稱,
        address,
        phone: r.機構電話 ? toHalfwidthDigits(r.機構電話) : null,
        lat: null,
        lng: null,
        serviceItem: r.機構層級 || null,
        serviceTime: null,
        dataOrg: "桃園市政府衛生局（opendata.tycg.gov.tw 33872）",
        extra: {
          smokingMedication: smokingMedicationFlag(r.給藥),
          smokingEducation: smokingEducationFlag(r.衛教),
          smokingDispensingOnly: null,
          dataAsOf,
        },
      } satisfies FacilityRecord;
    });
}

export async function fetchSmokingCessationTaoyuan(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`桃園市戒菸特約機構名冊 (33872) request failed: HTTP ${status}`);

  const rawRows = parseCsv(text) as unknown as SmokingCessationTaoyuanRawRow[];
  validateImportRows("桃園市戒菸特約機構名冊 (33872)", smokingCessationTaoyuanRawSchema, rawRows);

  return buildSmokingCessationTaoyuanRecords(rawRows, todayDataAsOf());
}
