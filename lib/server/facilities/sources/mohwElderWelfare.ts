import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpRequest } from "@/lib/server/net/httpClient";
import { decodeBig5, parseCsv, normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";

// 衛福部「全國老人福利機構名冊」(data.gov.tw dataset 8572) — unlike most other
// MOHW datasets this one ships as one Big5 CSV per county/city rather than a
// single national file, so all 22 have to be fetched and concatenated. No
// stable per-row ID, so sourceId is derived from name+address like the other
// MOHW sources with the same gap.
const COUNTY_URLS: { county: string; url: string }[] = [
  { county: "南投縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%8D%97%E6%8A%95%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "嘉義市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%98%89%E7%BE%A9%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "嘉義縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%98%89%E7%BE%A9%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "基隆市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%9F%BA%E9%9A%86%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "宜蘭縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%AE%9C%E8%98%AD%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "屏東縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%B1%8F%E6%9D%B1%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "彰化縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E5%BD%B0%E5%8C%96%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "新北市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E6%96%B0%E5%8C%97%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "新竹市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E6%96%B0%E7%AB%B9%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "新竹縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E6%96%B0%E7%AB%B9%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "桃園市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E6%A1%83%E5%9C%92%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "澎湖縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E6%BE%8E%E6%B9%96%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "臺中市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E8%87%BA%E4%B8%AD%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "臺北市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E8%87%BA%E5%8C%97%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "臺南市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E8%87%BA%E5%8D%97%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "臺東縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E8%87%BA%E6%9D%B1%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "花蓮縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E8%8A%B1%E8%93%AE%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "苗栗縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E8%8B%97%E6%A0%97%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "連江縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E9%80%A3%E6%B1%9F%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "金門縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E9%87%91%E9%96%80%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "雲林縣", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E9%9B%B2%E6%9E%97%E7%B8%A3%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
  { county: "高雄市", url: "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/8572/%E9%AB%98%E9%9B%84%E5%B8%82%E8%80%81%E4%BA%BA%E7%A6%8F%E5%88%A9%E6%A9%9F%E6%A7%8B%E5%90%8D%E5%86%8A.csv" },
];

interface ElderWelfareRow {
  機構名稱: string;
  地址: string;
  電話: string;
  收容對象: string;
}

async function fetchCounty(county: string, url: string): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, buffer } = await httpRequest(url);
  if (status < 200 || status >= 300) throw new Error(`MOHW elder welfare institution request failed for ${county}: HTTP ${status}`);

  const rows = parseCsv(decodeBig5(buffer)) as unknown as ElderWelfareRow[];

  return rows
    .filter((r) => r.機構名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(r.地址.startsWith(county) ? r.地址 : `${county}${r.地址}`);
      return {
        facilityType: "elder_welfare",
        sourceKey: "mohw_elder_welfare",
        sourceId: `${r.機構名稱}|${address}`.slice(0, 100),
        name: r.機構名稱,
        address,
        phone: r.電話 ? toHalfwidthDigits(r.電話) : null,
        lat: null,
        lng: null,
        serviceItem: r.收容對象 ? r.收容對象.replace(/\s*\n\s*/g, "、") : null,
        serviceTime: null,
        dataOrg: "衛福部",
      };
    });
}

// Sequential, not Promise.all — a transient failure on one county (this is
// 22 separate requests to a government host) shouldn't discard every other
// county's results along with it.
export async function fetchMohwElderWelfare(): Promise<FacilityRecord[]> {
  const all: FacilityRecord[] = [];
  for (const { county, url } of COUNTY_URLS) {
    try {
      all.push(...(await fetchCounty(county, url)));
    } catch (error) {
      console.error(`MOHW elder welfare fetch failed for ${county}:`, error instanceof Error ? error.message : error);
    }
  }
  return all;
}
