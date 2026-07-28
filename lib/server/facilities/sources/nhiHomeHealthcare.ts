import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpRequest } from "@/lib/server/net/httpClient";
import { toHalfwidthDigits } from "@/lib/server/facilities/csv";

// NHI 居家醫療照護整合系統地圖 API — reverse-engineered from
// info.nhi.gov.tw/INAE1000/INAE1000S00's compiled JS (INAE1000S00.js), since
// this dataset isn't in the CKAN-style iode0000s01 catalog. A single request
// with a generous radius from Taiwan's geographic center returns the whole
// country in one call (verified: km=300 and km=500 return the same count,
// i.e. nothing is being cut off by distance) — ships real wgs_lat/wgs_lon
// per institution, so no geocoding step is needed for this source.
const SEARCH_URL = "https://info.nhi.gov.tw/api/inae1000/INAEmapS01/search?homecare=";
const TAIWAN_CENTER = { lat: 23.7, lng: 120.9, km: 300 };

interface NhiHomeHealthcareItem {
  hosp_id: string;
  hosp_name: string;
  hosptel: string | null;
  hosp_addr: string | null;
  hosp_cnt_type: string | null;
  wgs_lat: number;
  wgs_lon: number;
}

interface NhiHomeHealthcareResponse {
  mapdata: NhiHomeHealthcareItem[];
}

export async function fetchNhiHomeHealthcare(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const response = await httpRequest(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lng: TAIWAN_CENTER.lng, lat: TAIWAN_CENTER.lat, km: TAIWAN_CENTER.km, keyword: "", datatype: "" }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`NHI home-healthcare request failed: HTTP ${response.status}`);
  }

  const json: NhiHomeHealthcareResponse = JSON.parse(response.buffer.toString("utf-8"));
  const items = json.mapdata ?? [];

  return items
    .filter((item) => item.hosp_id && item.hosp_name && item.wgs_lat && item.wgs_lon)
    .map((item) => ({
      facilityType: "home_healthcare",
      sourceKey: "nhi_home_healthcare",
      sourceId: item.hosp_id,
      name: item.hosp_name,
      address: item.hosp_addr ? toHalfwidthDigits(item.hosp_addr) : null,
      phone: item.hosptel ? toHalfwidthDigits(item.hosptel) : null,
      lat: item.wgs_lat,
      lng: item.wgs_lon,
      serviceItem: item.hosp_cnt_type || "居家醫療照護",
      serviceTime: null,
      dataOrg: "衛福部中央健康保險署",
    }));
}
