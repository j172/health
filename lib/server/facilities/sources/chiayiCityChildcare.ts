import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { parseCsv } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import {
  CHILDCARE_CATEGORY,
  CHILDCARE_COUNTY_CODE,
  buildChildcareSourceId,
  todayDataAsOf,
} from "@/lib/server/facilities/sources/childcareCenterShared";

/**
 * 嘉義市公私協力及私立托嬰中心 (issue #607, parent #599). data.gov.tw dataset
 * 63093, CSV resource hosted on data.chiayi.gov.tw, UTF-8, 11 rows total
 * (confirmed live via the egress-probe run below — resourceAmount in the
 * dataset's own data.gov.tw metadata also says 11).
 *
 * The only one of this ticket's four counties that already ships its own
 * WGS84 coordinates (經度/緯度 — confirmed live: every row has both), so no
 * geocode backfill is needed here, unlike the other three. 機構類型 is a
 * clean 2-value column (confirmed live against all 11 rows: only "私立" and
 * "公辦民營" appear) that maps directly onto two of the existing 4
 * childcare-center categories — note two of the "公辦民營" rows' *names*
 * literally contain "社區公共托育家園" (e.g. "嘉義市東區社區公共托育家園"),
 * but their 機構類型 column still says "公辦民營", not "社區公共托育家園" — the
 * category comes from the column, not a guess from the name text.
 *
 * Reachability (egress-probe run
 * https://github.com/j172/health/actions/runs/38707357085, 2026-10-15, and
 * the earlier https://github.com/j172/health/actions/runs/38556225761):
 * reachable (HTTP 200) from a GitHub Actions runner on both runs, but **times
 * out from the production host both times** — the "upstream IP-blocks the
 * shared host but not GitHub's" pattern this codebase has hit before (see
 * addictionTreatmentFacilities.ts, hpaSmokingCessation.ts, and the other
 * sources flagged the same way in runSync.ts). No SSH-loopback relay is
 * built here — that is a separate, larger change (fetch on the runner,
 * push the parsed rows to an admin endpoint over the loopback) that this
 * ticket deliberately leaves out of scope; until a relay exists or the host
 * block lifts, this source's scheduled sync will fail closed (0 rows,
 * logged error) like any other source whose fetch throws, same as the other
 * "unverified from host" sources already in runSync.ts.
 */
const SOURCE_URL =
  "https://data.chiayi.gov.tw/opendata/api/getResource?oid=7c85b71c-1fb7-4b38-998a-b1026883d5cd&rid=74504529-ed9c-49dd-b1b2-d242602fd13e";

const DATA_ORG = "嘉義市政府社會處（data.chiayi.gov.tw 開放資料）";

interface ChiayiCityChildcareRow {
  機構類型: string;
  機構名稱: string;
  地址: string;
  電話: string;
  核定收托人數: string;
  經度: string;
  緯度: string;
}

export const chiayiCityChildcareRawSchema = z.object({
  機構類型: z.string().nullable(),
  機構名稱: z.string().nullable(),
  地址: z.string().nullable(),
  電話: z.string().nullable(),
  核定收托人數: z.string().nullable(),
  經度: z.string().nullable(),
  緯度: z.string().nullable(),
});

function phoneOrNull(raw: string | undefined | null): string | null {
  // Confirmed live 2026-10-14: one row's 電話 has trailing whitespace
  // ("(05)2312667     ") — collapse-then-trim handles it the same way every
  // other childcare source in this family already does.
  const trimmed = (raw || "").replace(/\s+/g, " ").trim();
  return trimmed ? toHalfwidthDigits(trimmed) : null;
}

function nonEmpty(raw: string | undefined | null): string | null {
  const trimmed = (raw || "").trim();
  return trimmed || null;
}

/** 機構類型 → one of the 4 childcare-center categories, or null for a value not seen live (fails safe rather than mis-tagging). */
export function categorizeChiayiCity(institutionType: string): string | null {
  const type = (institutionType || "").trim();
  if (type === "私立") return CHILDCARE_CATEGORY.PRIVATE;
  if (type === "公辦民營") return CHILDCARE_CATEGORY.PUBLIC_PRIVATE;
  return null;
}

export function buildChiayiCityChildcareRecords(rawRows: ChiayiCityChildcareRow[], dataAsOf: string): FacilityRecord[] {
  return rawRows
    .filter((r) => r.機構名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(r.地址);
      const category = categorizeChiayiCity(r.機構類型);
      const lng = r.經度 ? parseFloat(r.經度) : null;
      const lat = r.緯度 ? parseFloat(r.緯度) : null;
      return {
        facilityType: "childcare_center",
        sourceKey: "chiayi_city_childcare_63093",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.chiayiCity, r.機構名稱, address),
        name: r.機構名稱,
        address,
        phone: phoneOrNull(r.電話),
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        serviceItem: category,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: { category, approvedCapacity: nonEmpty(r.核定收托人數), dataAsOf },
      } satisfies FacilityRecord;
    });
}

export async function fetchChiayiCityChildcare(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) {
    throw new Error(`嘉義市公私協力及私立托嬰中心 (63093) request failed: HTTP ${status}`);
  }

  const rawRows = parseCsv(text) as unknown as ChiayiCityChildcareRow[];
  validateImportRows("嘉義市公私協力及私立托嬰中心 (63093)", chiayiCityChildcareRawSchema, rawRows);

  return buildChiayiCityChildcareRecords(rawRows, todayDataAsOf());
}
