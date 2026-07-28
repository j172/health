import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";

// 全民健康保險特約藥局名冊（特約類別 5）
// Same underlying dataset family as nhiHospitals.ts (tiers 1-4), kept as its
// own source since this is a different facility_type ("pharmacy", not
// "clinic") and coexists alongside the TFDA pharmacy registry (tfda_pharmacy)
// rather than replacing it — NHI's list is contracted-pharmacies-only, TFDA's
// includes non-contracted ones too, and de-duping the two would need fuzzy
// name/address matching that isn't worth it for the added completeness.
const SOURCE_URL = "https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-D21005-001";

export async function fetchNhiPharmacies(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`NHI pharmacy dataset request failed: HTTP ${status}`);

  const rows = parseCsv(text);

  return rows
    .filter((row) => row["醫事機構代碼"] && row["醫事機構名稱"])
    .map((row) => ({
      facilityType: "pharmacy",
      sourceKey: "nhi_pharmacy",
      sourceId: row["醫事機構代碼"],
      name: row["醫事機構名稱"],
      address: toHalfwidthDigits(row["地址"] || ""),
      phone: row["電話"] ? toHalfwidthDigits(row["電話"]) : null,
      lat: null,
      lng: null,
      serviceItem: "健保特約藥局",
      serviceTime: row["固定看診時段"] || null,
      dataOrg: "衛福部中央健康保險署",
    }));
}
