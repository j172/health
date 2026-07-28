import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";

// 全民健康保險特約醫事機構名冊（依特約類別分檔）
// https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=<dataset>
const TIERS: { rId: string; tier: string }[] = [
  { rId: "A21030000I-D21001-003", tier: "醫學中心" },
  { rId: "A21030000I-D21002-005", tier: "區域醫院" },
  { rId: "A21030000I-D21003-003", tier: "地區醫院" },
];

const BASE_URL = "https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=";

export async function fetchNhiHospitals(): Promise<FacilityRecord[]> {
  const records: FacilityRecord[] = [];

  for (const { rId, tier } of TIERS) {
    // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
    // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
    const { status, text } = await httpGetText(`${BASE_URL}${rId}`);
    if (status < 200 || status >= 300) {
      throw new Error(`NHI hospital dataset ${rId} (${tier}) request failed: HTTP ${status}`);
    }

    const rows = parseCsv(text);
    for (const row of rows) {
      const code = row["醫事機構代碼"];
      const name = row["醫事機構名稱"];
      if (!code || !name) continue;

      records.push({
        facilityType: "clinic",
        sourceKey: "nhi_hospital",
        sourceId: code,
        name,
        address: toHalfwidthDigits(row["地址"] || ""),
        phone: row["電話"] ? toHalfwidthDigits(row["電話"]) : null,
        lat: null,
        lng: null,
        serviceItem: tier,
        serviceTime: row["診療科別"] || null,
        dataOrg: "衛福部中央健康保險署",
      });
    }
  }

  return records;
}
