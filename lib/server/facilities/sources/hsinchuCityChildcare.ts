import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import { CHILDCARE_COUNTY_CODE, buildChildcareSourceId, todayDataAsOf } from "@/lib/server/facilities/sources/childcareCenterShared";

/**
 * 新竹市公私立托嬰中心名冊 (issue #607, parent #599 — one of the four 新竹市/
 * 新竹縣/彰化/嘉義市 county tickets that extend #601's taipeiChildcare.ts/
 * ntpcChildcare.ts pattern). data.gov.tw dataset 67734, CSV resource hosted
 * on odws.hccg.gov.tw, UTF-8 (with BOM) — confirmed live 2026-10-14.
 *
 * Unlike every other childcare source in this family, this roster has no
 * column distinguishing 公辦民營/準公共/私立 at all (just 中心名稱, 負責人,
 * 住址, 電話01, 核准文號) — the dataset title "公私立托嬰中心名冊" lumps every
 * establishment type into one undifferentiated list. Guessing a category
 * from the name/notes text would be unreliable, so `category`/`serviceItem`
 * are deliberately left null for every row here rather than invented.
 *
 * Reachability (egress-probe run
 * https://github.com/j172/health/actions/runs/38556225761, 2026-10-14):
 * reachable (HTTP 200) from an ordinary residential network, but **timed out
 * from both the production host and a GitHub Actions runner** — i.e.
 * genuinely unreachable from production/CI right now, not just host-IP-
 * blocked (which would show the runner succeeding). No relay fixes that;
 * until odws.hccg.gov.tw becomes reachable from one side or the other, this
 * source's scheduled sync will fail closed (0 rows, logged error) like any
 * other source whose fetch throws — see runSource() in
 * lib/server/sync/runSource.ts.
 */
const SOURCE_URL =
  "https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/79/8aeab289-f13b-4e19-b55d-a97f9da7be5b.csv";

const DATA_ORG = "新竹市政府社會處（odws.hccg.gov.tw 開放資料）";

interface HccgChildcareRow {
  中心名稱: string;
  住址: string;
  電話01: string;
}

export const hccgChildcareRawSchema = z.object({
  中心名稱: z.string().nullable(),
  住址: z.string().nullable(),
  電話01: z.string().nullable(),
});

function phoneOrNull(raw: string | undefined | null): string | null {
  const trimmed = (raw || "").replace(/\s+/g, " ").trim();
  return trimmed ? toHalfwidthDigits(trimmed) : null;
}

/**
 * Pure (no I/O) builder, separated out purely so a realistic fixture can
 * exercise the 巿→市 typo fix below without mocking the network call.
 */
export function buildHsinchuCityChildcareRecords(rawRows: HccgChildcareRow[], dataAsOf: string): FacilityRecord[] {
  return rawRows
    .filter((r) => r.中心名稱 && r.住址)
    .map((r) => {
      // Confirmed live 2026-10-14: 1 of 80 rows uses the archaic variant
      // character "巿" (U+5DFF) instead of "市" (U+5E02) in "新竹巿" — visually
      // near-identical but a different codepoint, which would silently fail
      // geocoding/display. Not a general-purpose fix (scoped to this one
      // source, not added to the shared normalizeAddress()), since it's this
      // dataset's own typo, not a pattern seen elsewhere yet.
      const fixedAddress = r.住址.replace(/巿/g, "市");
      const address = normalizeAddress(fixedAddress);
      return {
        facilityType: "childcare_center",
        sourceKey: "hccg_childcare_67734",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.hsinchuCity, r.中心名稱, address),
        name: r.中心名稱,
        address,
        phone: phoneOrNull(r.電話01),
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: { dataAsOf },
      } satisfies FacilityRecord;
    });
}

export async function fetchHsinchuCityChildcare(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`新竹市公私立托嬰中心名冊 (67734) request failed: HTTP ${status}`);

  const rawRows = parseCsv(text) as unknown as HccgChildcareRow[];
  validateImportRows("新竹市公私立托嬰中心名冊 (67734)", hccgChildcareRawSchema, rawRows);

  return buildHsinchuCityChildcareRecords(rawRows, todayDataAsOf());
}
