import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpRequest } from "@/lib/server/net/httpClient";
import { decodeBig5, parseCsv, normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";

// 衛福部「全國身心障礙福利機構一覽表」— single national CSV, Big5-encoded, no
// coordinates (geocoded via the usual facilities-geocode backfill). No
// stable per-row ID in the source, so sourceId is derived from name+address
// like the other MOHW sources with the same gap (mohw_hpa_facility etc.).
const SOURCE_URL =
  "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/12061/%E5%85%A8%E5%9C%8B%E8%BA%AB%E5%BF%83%E9%9A%9C%E7%A4%99%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E4%B8%80%E8%A6%BD%E8%A1%A8.csv";

interface DisabilityWelfareRow {
  機構名稱: string;
  縣市: string;
  鄉鎮市區: string;
  地址: string;
  連絡電話: string;
  機構類型: string;
}

export async function fetchMohwDisabilityWelfare(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, buffer } = await httpRequest(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`MOHW disability welfare institution request failed: HTTP ${status}`);

  const rows = parseCsv(decodeBig5(buffer)) as unknown as DisabilityWelfareRow[];

  return rows
    .filter((r) => r.機構名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(`${r.縣市}${r.鄉鎮市區}${r.地址}`);
      return {
        facilityType: "disability_welfare",
        sourceKey: "mohw_disability_welfare",
        sourceId: `${r.機構名稱}|${address}`.slice(0, 100),
        name: r.機構名稱,
        address,
        phone: r.連絡電話 ? toHalfwidthDigits(r.連絡電話) : null,
        lat: null,
        lng: null,
        serviceItem: r.機構類型 || null,
        serviceTime: null,
        dataOrg: "衛福部",
      };
    });
}
