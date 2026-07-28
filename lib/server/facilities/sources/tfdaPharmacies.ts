import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";

// 衛福部食藥署藥局管理系統開放資料
// https://data.fda.gov.tw/data/opendata/export/35/json
const SOURCE_URL = "https://data.fda.gov.tw/data/opendata/export/35/json";

interface TfdaPharmacyRaw {
  機構狀態: string;
  機構名稱: string;
  地址縣市別: string;
  地址鄉鎮市區: string;
  地址街道巷弄號: string;
  負責人姓名: string;
  負責人性別: string;
  電話: string;
  是否為健保特約藥局: string;
}

export async function fetchTfdaPharmacies(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`TFDA pharmacies request failed: HTTP ${status}`);

  const raw: TfdaPharmacyRaw[] = JSON.parse(text);

  return raw
    .filter((item) => item.機構狀態 === "開業" && item.機構名稱)
    .map((item, index) => {
      const address = `${item.地址縣市別}${item.地址鄉鎮市區}${item.地址街道巷弄號}`;
      return {
        facilityType: "pharmacy",
        sourceKey: "tfda_pharmacy",
        // The dataset has no stable unique ID field, so derive one from name+address
        // (kept short/deterministic so re-ingesting the same record upserts, not duplicates).
        sourceId: `${item.機構名稱}|${address}`.slice(0, 100) || `row-${index}`,
        name: item.機構名稱,
        address,
        phone: item.電話 || null,
        lat: null,
        lng: null,
        serviceItem: item.是否為健保特約藥局 === "Y" ? "健保特約藥局" : "一般藥局",
        serviceTime: null,
        dataOrg: "衛福部食藥署",
      };
    });
}
