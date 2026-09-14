import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";

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

// Critical-field schema for the raw rows. `sourceId` (see
// docs/specs/mol-occupational-injury-source-id-migration.md — the original
// incident this validation exists to catch a recurrence of) is derived from
// 醫療機構名稱/地址/直轄市或省轄縣市, so those three are validated for
// presence+type here; the rest (phone/contact fields) aren't identity-
// bearing and are left unchecked. `.nullable()` (not `.optional()`) so a
// field entirely absent from every row (renamed/removed upstream) fails
// loudly, while one row's legitimately empty value still passes.
export const molOccupationalInjuryRawSchema = z.object({
  醫療機構名稱: z.string().nullable(),
  地址: z.string().nullable(),
  直轄市或省轄縣市: z.string().nullable(),
});

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

export function buildMolOccupationalInjurySourceId(name: string, address?: string | null): string {
  return `${name.trim()}|${(address || "").trim()}`.slice(0, 100);
}

export async function fetchMolOccupationalInjuryHospitals(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`MOL occupational-injury hospitals request failed: HTTP ${status}`);

  const raw: MolOccupationalRaw[] = JSON.parse(text);
  validateImportRows("MOL occupational-injury hospitals", molOccupationalInjuryRawSchema, raw);

  return raw
    .filter((r) => r.醫療機構名稱)
    .map((r) => {
      const cleanAddress = normalizeAddress(withCountyPrefix(r.直轄市或省轄縣市 || "", r.地址 || ""));
      return {
        facilityType: "health_check",
        sourceKey: "mol_occupational_injury",
        sourceId: buildMolOccupationalInjurySourceId(r.醫療機構名稱, cleanAddress),
        name: r.醫療機構名稱,
        address: cleanAddress,
        phone: r.市話 ? toHalfwidthDigits(r.市話) + (r.分機 ? ` 分機${toHalfwidthDigits(r.分機)}` : "") : null,
        lat: null,
        lng: null,
        serviceItem: "職業傷病防治網絡醫院",
        serviceTime: r.聯絡人 ? `聯絡人：${r.聯絡人}` : null,
        dataOrg: "勞動部",
      };
    });
}
