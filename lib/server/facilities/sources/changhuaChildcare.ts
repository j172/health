import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpRequest } from "@/lib/server/net/httpClient";
import { decodeBig5, normalizeAddress, parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import { CHILDCARE_COUNTY_CODE, buildChildcareSourceId, todayDataAsOf } from "@/lib/server/facilities/sources/childcareCenterShared";

/**
 * 彰化縣公私協力及私立托嬰中心 (issue #607, parent #599). data.gov.tw dataset
 * 95198, CSV resource hosted on email.chcg.gov.tw. data.gov.tw's own
 * metadata labels this resource's charset "BIG5" (the ticket calls it
 * cp950) — decoded the same way as hsinchuCountyChildcare.ts, see that
 * module's comment for why `TextDecoder("big5")` is the right tool for a
 * cp950-labelled resource.
 *
 * Every one of the 41 live rows shares the exact same 項目 value ("公私協力
 * 及私立托嬰中心") — confirmed live 2026-10-14 — so unlike 新竹縣 this
 * dataset genuinely has no per-row field that distinguishes 公辦民營/準公共/
 * 私立/社區公共托育家園 at all (same situation as hsinchuCityChildcare.ts).
 * `category`/`serviceItem` are left null rather than guessed from the one
 * constant label. 地址縣市/地址鄉鎮市區 are administrative-area *codes*
 * (e.g. "10007"/"10007010"), not names, and are redundant anyway since 地址
 * already carries the full county+district+street text — they are not used
 * for anything here.
 *
 * Reachability (egress-probe run
 * https://github.com/j172/health/actions/runs/38556225761, 2026-10-14):
 * reachable (HTTP 200) from an ordinary residential network, a GitHub
 * Actions runner, AND the production host — the one host of this ticket's
 * four confirmed fully reachable everywhere, so this source is safe to put
 * on the normal schedule with no caveat.
 */
const SOURCE_URL = "https://email.chcg.gov.tw/df/96w4h97lpyyqyecen6b6wj46cym7d2";

const DATA_ORG = "彰化縣政府社會處（email.chcg.gov.tw 開放資料）";

interface ChanghuaChildcareRow {
  名稱: string;
  地址: string;
  電話: string;
}

export const changhuaChildcareRawSchema = z.object({
  名稱: z.string().nullable(),
  地址: z.string().nullable(),
  電話: z.string().nullable(),
});

function phoneOrNull(raw: string | undefined | null): string | null {
  const trimmed = (raw || "").replace(/\s+/g, " ").trim();
  return trimmed ? toHalfwidthDigits(trimmed) : null;
}

export function buildChanghuaChildcareRecords(rawRows: ChanghuaChildcareRow[], dataAsOf: string): FacilityRecord[] {
  return rawRows
    .filter((r) => r.名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(r.地址);
      return {
        facilityType: "childcare_center",
        sourceKey: "changhua_childcare_95198",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.changhua, r.名稱, address),
        name: r.名稱,
        address,
        phone: phoneOrNull(r.電話),
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: { dataAsOf },
      } satisfies FacilityRecord;
    });
}

export async function fetchChanghuaChildcare(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts. Using
  // httpRequest (not httpGetText) for the raw buffer — this resource needs a
  // Big5/cp950 decode, not UTF-8.
  const res = await httpRequest(SOURCE_URL, { timeoutMs: 15000 });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`彰化縣公私協力及私立托嬰中心 (95198) request failed: HTTP ${res.status}`);
  }

  const text = decodeBig5(res.buffer);
  const rawRows = parseCsv(text) as unknown as ChanghuaChildcareRow[];
  validateImportRows("彰化縣公私協力及私立托嬰中心 (95198)", changhuaChildcareRawSchema, rawRows);

  return buildChanghuaChildcareRecords(rawRows, todayDataAsOf());
}
