import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";

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

// 3 of the 39 rows' 地址 doesn't already carry the county/city name from
// 直轄市或省轄縣市 (confirmed live: the 宜蘭縣/苗栗縣 rows give addresses
// starting with just the city, "宜蘭市"/"苗栗市", no leading 縣; the 臺東縣
// row spells its own address with the informal "台" variant of 臺) —
// prepend the county so every address is geocodable/displayable on its own,
// but only when it's actually missing (checking both the official and
// informal 臺/台 spelling) to avoid producing "臺東縣台東縣...".
function withCountyPrefix(county: string, address: string): string {
  if (!address) return county;
  const informalCounty = county.replace(/^臺/, "台");
  if (address.startsWith(county) || address.startsWith(informalCounty)) return address;
  return `${county}${address}`;
}

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
      address: normalizeAddress(withCountyPrefix(r.直轄市或省轄縣市 || "", r.地址 || "")),
      phone: r.市話 ? toHalfwidthDigits(r.市話) + (r.分機 ? ` 分機${toHalfwidthDigits(r.分機)}` : "") : null,
      lat: null,
      lng: null,
      serviceItem: "職業傷病防治網絡醫院",
      serviceTime: r.聯絡人 ? `聯絡人：${r.聯絡人}` : null,
      dataOrg: "勞動部",
    }));
}
