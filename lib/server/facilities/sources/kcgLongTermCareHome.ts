import type { FacilityRecord } from "@/lib/server/facilities/queries";

// 高雄市政府社會局 — 居家式服務類長期照顧服務機構
// https://openapi.kcg.gov.tw/Api/Service/Get/59ac925f-10dd-42f7-a540-ab6c4218b93d
const SOURCE_URL = "https://openapi.kcg.gov.tw/Api/Service/Get/59ac925f-10dd-42f7-a540-ab6c4218b93d";

interface KcgRawItem {
  id: string;
  lat: string;
  lng: string;
  informaddress: string;
  informtel: string;
  servItem: string;
  servTime: string;
  dataOrg: string;
  text: string;
}

interface KcgResponse {
  data: KcgRawItem[];
}

const parseCoord = (v: string): number | null => {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

export async function fetchKcgLongTermCareHome(): Promise<FacilityRecord[]> {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`KCG long-term care request failed: HTTP ${res.status}`);

  const json: KcgResponse = await res.json();
  const items = Array.isArray(json.data) ? json.data : [];

  return items
    .filter((item) => item.id && item.text)
    .map((item) => ({
      facilityType: "long_term_care",
      sourceKey: "kcg_home_care",
      sourceId: item.id,
      name: item.text,
      address: item.informaddress || null,
      phone: item.informtel || null,
      lat: parseCoord(item.lat),
      lng: parseCoord(item.lng),
      serviceItem: item.servItem || null,
      serviceTime: item.servTime || null,
      dataOrg: item.dataOrg || null,
    }));
}
