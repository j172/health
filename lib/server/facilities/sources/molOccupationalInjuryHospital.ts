import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";

// 勞動部職業傷病防治網絡醫院開放資料
// https://apiservice.mol.gov.tw/OdService/download/A17000000J-030081-puW
const SOURCE_URL = "https://apiservice.mol.gov.tw/OdService/download/A17000000J-030081-puW";

interface MolOccupationalRaw {
  序號: string;
  直轄市或省轄縣市: string;
  醫療機構名稱: string;
  市話: string;
  分機: string;
  聯絡人: string;
  地址: string;
}

const toHalfwidthDigits = (s: string): string => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));

export async function fetchMolOccupationalInjuryHospitals(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`MOL occupational-injury hospitals request failed: HTTP ${status}`);

  const raw: MolOccupationalRaw[] = JSON.parse(text);

  return raw
    .filter((r) => r.醫療機構名稱)
    .map((r) => ({
      facilityType: "health_check",
      sourceKey: "mol_occupational_injury",
      sourceId: r.序號 || r.醫療機構名稱,
      name: r.醫療機構名稱,
      address: toHalfwidthDigits(r.地址 || ""),
      phone: r.市話 ? toHalfwidthDigits(r.市話) + (r.分機 ? ` 分機${toHalfwidthDigits(r.分機)}` : "") : null,
      lat: null,
      lng: null,
      serviceItem: "職業傷病防治網絡醫院",
      serviceTime: r.聯絡人 ? `聯絡人：${r.聯絡人}` : null,
      dataOrg: "勞動部",
    }));
}
