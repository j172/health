import "server-only";
import { httpGetJson } from "@/lib/server/net/httpClient";
import { getTdxToken } from "@/lib/server/tdx/auth";
import { TAIWAN_COUNTIES } from "@/lib/constants/taiwanDistricts";

/**
 * The 10 TDX Senior/Rail RailSystem codes (issue #434 / docs/specs/
 * tdx-senior-rail-accessibility-upgrade.md section 2): 臺鐵、高鐵、四個都會捷運、
 * 兩個輕軌系統、新北捷運與臺北捷運。
 */
export const RAIL_SYSTEMS = [
  "TRA",
  "THSR",
  "TRTC",
  "NTMC",
  "TYMC",
  "TMRT",
  "KRTC",
  "KLRT",
  "NTDLRT",
  "NTALRT",
] as const;

export type RailSystem = (typeof RAIL_SYSTEMS)[number];

interface TdxBasicStationItem {
  StationID: string;
  StationAddress?: string;
}

// TDX's Basic Rail Station API has no dedicated county field either — only a
// free-text StationAddress string that happens to start with a postal code
// followed by the county/city name (e.g. "236040新北市土城區..."). Building
// the county lookup from this field (rather than a hand-maintained static
// table) means it stays correct even for systems that cross county lines —
// confirmed live 2026-10-10: TRTC's 頂埔 station (operated by Taipei Metro)
// actually sits in 新北市, not 臺北市, so a single "TRTC → 臺北市" constant
// would have been wrong for a meaningful share of its own stations.
const COUNTY_PATTERN = new RegExp(
  TAIWAN_COUNTIES.flatMap((c) => [c, c.replace("臺", "台")]).join("|"),
);

const extractCounty = (address?: string | null): string | null => {
  if (!address) return null;
  const match = address.match(COUNTY_PATTERN);
  if (!match) return null;
  // Normalize the 台/臺 variant back to the canonical 臺 form used elsewhere
  // in this repo's TAIWAN_COUNTIES list.
  return match[0].replace("台", "臺");
};

/**
 * TDX's Basic Rail Station API (confirmed live 2026-10-10 against
 * /api/basic/v2/Rail/TRA/Station and /api/basic/v2/Rail/Metro/Station/TRTC)
 * splits TRA/THSR from the rest: TRA and THSR each have their own dedicated
 * path, while every metro/light-rail system is addressed as
 * Rail/Metro/Station/{System} with the same RailSystem codes used by the
 * Senior API.
 */
const basicStationUrl = (system: RailSystem): string => {
  if (system === "TRA") return "https://tdx.transportdata.tw/api/basic/v2/Rail/TRA/Station?%24format=JSON";
  if (system === "THSR") return "https://tdx.transportdata.tw/api/basic/v2/Rail/THSR/Station?%24format=JSON";
  return `https://tdx.transportdata.tw/api/basic/v2/Rail/Metro/Station/${system}?%24format=JSON`;
};

/**
 * Builds a StationID -> county map for one RailSystem by calling TDX's Basic
 * (not Senior) Station API once. Returns an empty map on any failure so
 * callers can fall back to a county-less row rather than throwing.
 */
export async function fetchStationCountyMap(system: RailSystem): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const token = await getTdxToken();
  if (!token) return map;

  try {
    const res = await httpGetJson<TdxBasicStationItem[]>(basicStationUrl(system), {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      timeoutMs: 12000,
    });
    if (res.status !== 200 || !Array.isArray(res.data)) return map;

    for (const st of res.data) {
      const county = extractCounty(st.StationAddress);
      if (st.StationID && county) map.set(st.StationID, county);
    }
  } catch (err) {
    console.warn(`fetchStationCountyMap(${system}) failed:`, err instanceof Error ? err.message : String(err));
  }

  return map;
}

/**
 * Fallback county used when a station's address can't be resolved (e.g. the
 * Basic Station API call for that system failed). Picked as each system's
 * majority/headquarters county — only ever used as a last resort, see
 * fetchStationCountyMap above for the real per-station derivation.
 */
export const RAIL_SYSTEM_FALLBACK_COUNTY: Record<RailSystem, string> = {
  TRA: "全國",
  THSR: "全國",
  TRTC: "臺北市",
  NTMC: "新北市",
  TYMC: "桃園市",
  TMRT: "臺中市",
  KRTC: "高雄市",
  KLRT: "高雄市",
  NTDLRT: "新北市",
  NTALRT: "新北市",
};
