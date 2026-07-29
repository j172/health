import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";

// 勞動部勞工體格及健康檢查認可醫療機構開放資料
// https://apiservice.mol.gov.tw/OdService/download/A17000000J-020057-8CT
// Same underlying dataset (A17000000J-020057) as the old rest/datastore
// endpoint, but this "download" distribution carries richer fields
// (contact person, remarks) the datastore one didn't expose.
// Note: NHI's equivalent elderly/adult-checkup dataset (data.nhi.gov.tw) is
// currently unreachable from this host (DNS resolution fails outright), so
// this source is labor-checkup facilities only for now.
const SOURCE_URL = "https://apiservice.mol.gov.tw/OdService/download/A17000000J-020057-8CT";

interface MolRawRecord {
  資料更新日期: string;
  縣市別: string;
  醫療機構代碼: string;
  醫療機構名稱: string;
  醫療機構地址: string;
  勞工健檢聯絡人: string;
  連絡電話: string;
  分機號碼: string;
  認可類別及有效期限: string;
  備註: string;
}

export async function fetchMolHealthCheckFacilities(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`MOL health-check facilities request failed: HTTP ${status}`);

  const records: MolRawRecord[] = JSON.parse(text);

  return records
    .filter((r) => r.醫療機構代碼 && r.醫療機構名稱)
    .map((r) => ({
      facilityType: "health_check",
      sourceKey: "mol_labor_checkup",
      sourceId: r.醫療機構代碼,
      name: r.醫療機構名稱,
      address: normalizeAddress(r.醫療機構地址 || ""),
      phone: r.連絡電話 ? toHalfwidthDigits(r.連絡電話) + (r.分機號碼 && r.分機號碼 !== "0" ? ` 分機${toHalfwidthDigits(r.分機號碼)}` : "") : null,
      lat: null,
      lng: null,
      serviceItem: r.認可類別及有效期限 || null,
      serviceTime: r.勞工健檢聯絡人 ? `聯絡人：${r.勞工健檢聯絡人}` : null,
      dataOrg: "勞動部",
      extra: {
        remarks: r.備註 || null,
        dataUpdatedAt: r.資料更新日期 || null,
      },
    }));
}
