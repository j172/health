import type { ForestFireSiteSeed } from "@/lib/server/forestFire/types";

/**
 * 林火風險 61 個地點的座標 seed (B-12, issue #672).
 *
 * MOA's `ForestFireAlertWCF` feed carries no coordinates at all (docs/2.0/
 * track-b-opendata-phase2-3-spec.md section 2.4 D-2). The 61 "測站/國家森林遊樂區"
 * are the very sites of 林業及自然保育署「林火風險評估系統」, whose public map
 * (https://ffwi.forest.gov.tw) serves them as GeoJSON together with their
 * WGS84 coordinates:
 *   - https://ffwi.forest.gov.tw/data/station/recreationAreaWarningLevel.json  (21 recreation areas, codes 1-21)
 *   - https://ffwi.forest.gov.tw/data/station/stationWarningLevel.json         (station list, 4-digit codes)
 * Retrieved 2026-10-15 (plain GET of the two static files; no coordinate here is
 * guessed or geocoded). Values are the GeoJSON [lng, lat] rounded to 6 decimals.
 *
 * How each MOA row was tied to a coordinate (`match`):
 *   - "code": the MOA `Code` equals the system's `station_code` AND the names agree
 *     (59 of 61 sites).
 *   - "name": MOA's code is not present in the system, but the MOA `name` equals the
 *     system's station name (minus the trailing 「測站」), and that name is unique in
 *     the system. Only two sites: MOA 1102 冬山 -> system 1601 冬山測站, and MOA
 *     2101 滿月圓 -> system 2501 滿月圓測站 (the 滿月圓 station sits ~1 km from the
 *     recreation area it is named after, matching 新北市三峽區). `ffwiCode` records the
 *     system's code. Re-verify these two against MOA/FFWI if either ever looks off.
 *
 * Cross-check: 林業及自然保育署台灣山林悠遊網's BasicInfo/RA open data (TWD97 X/Y,
 * https://recreation.forest.gov.tw/mis/api/BasicInfo/RA) lists 18 of the 21
 * recreation areas under the same names. 17 of those 18 fall within ~0-3.6 km of
 * the coordinates below; the exception is 太平山 (8 km; the 悠遊網 point is not near
 * the 太平山莊 address the system uses, so the system's coordinate is kept). The
 * other three (棲蘭, 明池, 惠蓀林場) are not Forestry-Agency-run parks and have no
 * second source; their coordinates rest on the 林火風險評估系統 alone.
 *
 * `county`/`town` come from the same files (stations: `city`/`town`; recreation
 * areas: the county prefix of `address`). `cityCode` maps county -> the 22
 * city codes used by lib/server/outdoorSafety/queries.ts (TAIWAN_CITIES).
 *
 * lib/server/forestFire/forestFire.test.mjs fails if any code in the live feed
 * fixture lacks an entry here or has non-finite / out-of-Taiwan coordinates.
 */
export const FOREST_FIRE_SITES: ForestFireSiteSeed[] = [
  { code: "1", name: "太平山國家森林遊樂區", kind: "recreation_area", county: "宜蘭縣", cityCode: "ILA", town: null, lat: 24.492738, lng: 121.536816, ffwiCode: "1", match: "code" },
  { code: "2", name: "滿月圓國家森林遊樂區", kind: "recreation_area", county: "新北市", cityCode: "NTPC", town: null, lat: 24.822226, lng: 121.44906, ffwiCode: "2", match: "code" },
  { code: "3", name: "內洞國家森林遊樂區", kind: "recreation_area", county: "新北市", cityCode: "NTPC", town: null, lat: 24.834468, lng: 121.526356, ffwiCode: "3", match: "code" },
  { code: "4", name: "東眼山國家森林遊樂區", kind: "recreation_area", county: "桃園市", cityCode: "TYCG", town: null, lat: 24.831539, lng: 121.40971, ffwiCode: "4", match: "code" },
  { code: "5", name: "觀霧國家森林遊樂區", kind: "recreation_area", county: "苗栗縣", cityCode: "MLH", town: null, lat: 24.505943, lng: 121.113671, ffwiCode: "5", match: "code" },
  { code: "6", name: "武陵國家森林遊樂區", kind: "recreation_area", county: "臺中市", cityCode: "TCH", town: null, lat: 24.397549, lng: 121.307273, ffwiCode: "6", match: "code" },
  { code: "7", name: "八仙山國家森林遊樂區", kind: "recreation_area", county: "臺中市", cityCode: "TCH", town: null, lat: 24.192346, lng: 121.014689, ffwiCode: "7", match: "code" },
  { code: "8", name: "大雪山國家森林遊樂區", kind: "recreation_area", county: "臺中市", cityCode: "TCH", town: null, lat: 24.255415, lng: 121.008142, ffwiCode: "8", match: "code" },
  { code: "9", name: "合歡山國家森林遊樂區", kind: "recreation_area", county: "花蓮縣", cityCode: "HUA", town: null, lat: 24.142428, lng: 121.284454, ffwiCode: "9", match: "code" },
  { code: "10", name: "奧萬大國家森林遊樂區", kind: "recreation_area", county: "南投縣", cityCode: "NTO", town: null, lat: 23.953633, lng: 121.177332, ffwiCode: "10", match: "code" },
  { code: "11", name: "阿里山國家森林遊樂區", kind: "recreation_area", county: "嘉義縣", cityCode: "CYH", town: null, lat: 23.508795, lng: 120.80198, ffwiCode: "11", match: "code" },
  { code: "12", name: "藤枝國家森林遊樂區", kind: "recreation_area", county: "高雄市", cityCode: "KCG", town: null, lat: 23.067579, lng: 120.754615, ffwiCode: "12", match: "code" },
  { code: "13", name: "墾丁國家森林遊樂區", kind: "recreation_area", county: "屏東縣", cityCode: "PTH", town: null, lat: 21.958723, lng: 120.8119, ffwiCode: "13", match: "code" },
  { code: "14", name: "雙流國家森林遊樂區", kind: "recreation_area", county: "屏東縣", cityCode: "PTH", town: null, lat: 22.217712, lng: 120.796026, ffwiCode: "14", match: "code" },
  { code: "15", name: "知本森林遊樂區", kind: "recreation_area", county: "臺東縣", cityCode: "TTT", town: null, lat: 22.687161, lng: 120.991286, ffwiCode: "15", match: "code" },
  { code: "16", name: "向陽國家森林遊樂區", kind: "recreation_area", county: "臺東縣", cityCode: "TTT", town: null, lat: 23.248077, lng: 120.984937, ffwiCode: "16", match: "code" },
  { code: "17", name: "池南國家森林遊樂區", kind: "recreation_area", county: "花蓮縣", cityCode: "HUA", town: null, lat: 23.918272, lng: 121.502044, ffwiCode: "17", match: "code" },
  { code: "18", name: "富源國家森林遊樂區", kind: "recreation_area", county: "花蓮縣", cityCode: "HUA", town: null, lat: 23.588984, lng: 121.354504, ffwiCode: "18", match: "code" },
  { code: "19", name: "棲蘭森林遊樂園區", kind: "recreation_area", county: "宜蘭縣", cityCode: "ILA", town: null, lat: 24.587496, lng: 121.467731, ffwiCode: "19", match: "code" },
  { code: "20", name: "明池森林遊樂區", kind: "recreation_area", county: "宜蘭縣", cityCode: "ILA", town: null, lat: 24.65837, lng: 121.472502, ffwiCode: "20", match: "code" },
  { code: "21", name: "惠蓀林場森林遊樂區", kind: "recreation_area", county: "南投縣", cityCode: "NTO", town: null, lat: 24.082403, lng: 121.035594, ffwiCode: "21", match: "code" },
  { code: "1102", name: "冬山", kind: "station", county: "宜蘭縣", cityCode: "ILA", town: "南澳鄉", lat: 24.605889, lng: 121.747688, ffwiCode: "1601", match: "name" },
  { code: "1103", name: "冷水坑", kind: "station", county: "臺北市", cityCode: "TPE", town: "士林區", lat: 25.165367, lng: 121.563779, ffwiCode: "1103", match: "code" },
  { code: "1201", name: "礁溪", kind: "station", county: "宜蘭縣", cityCode: "ILA", town: "礁溪鄉", lat: 24.832255, lng: 121.774001, ffwiCode: "1201", match: "code" },
  { code: "1301", name: "南澳", kind: "station", county: "宜蘭縣", cityCode: "ILA", town: "南澳鄉", lat: 24.422832, lng: 121.79301, ffwiCode: "1301", match: "code" },
  { code: "1501", name: "太平山", kind: "station", county: "宜蘭縣", cityCode: "ILA", town: "大同鄉", lat: 24.492127, lng: 121.536309, ffwiCode: "1501", match: "code" },
  { code: "2101", name: "滿月圓", kind: "station", county: "新北市", cityCode: "NTPC", town: "三峽區", lat: 24.83055, lng: 121.444553, ffwiCode: "2501", match: "name" },
  { code: "2102", name: "內洞", kind: "station", county: "新北市", cityCode: "NTPC", town: "烏來區", lat: 24.834307, lng: 121.526367, ffwiCode: "2102", match: "code" },
  { code: "2201", name: "拉拉山", kind: "station", county: "桃園市", cityCode: "TYCG", town: "復興區", lat: 24.703242, lng: 121.422827, ffwiCode: "2201", match: "code" },
  { code: "2202", name: "東眼山", kind: "station", county: "桃園市", cityCode: "TYCG", town: "復興區", lat: 24.831364, lng: 121.407814, ffwiCode: "2202", match: "code" },
  { code: "2302", name: "觀霧", kind: "station", county: "苗栗縣", cityCode: "MLH", town: "泰安鄉", lat: 24.505809, lng: 121.113975, ffwiCode: "2302", match: "code" },
  { code: "2303", name: "五指山", kind: "station", county: "新竹縣", cityCode: "HSH", town: "北埔鄉", lat: 24.641333, lng: 121.096111, ffwiCode: "2303", match: "code" },
  { code: "2402", name: "虎山", kind: "station", county: "苗栗縣", cityCode: "MLH", town: "泰安鄉", lat: 24.470821, lng: 120.977962, ffwiCode: "2402", match: "code" },
  { code: "2403", name: "北坑山", kind: "station", county: "苗栗縣", cityCode: "MLH", town: "泰安鄉", lat: 24.426056, lng: 121.013389, ffwiCode: "2403", match: "code" },
  { code: "3101", name: "鞍馬山", kind: "station", county: "臺中市", cityCode: "TCH", town: "和平區", lat: 24.266186, lng: 120.998621, ffwiCode: "3101", match: "code" },
  { code: "3201", name: "雙崎", kind: "station", county: "臺中市", cityCode: "TCH", town: "東勢區", lat: 24.246275, lng: 120.832836, ffwiCode: "3201", match: "code" },
  { code: "3301", name: "梨山", kind: "station", county: "臺中市", cityCode: "TCH", town: "和平區", lat: 24.25452, lng: 121.246167, ffwiCode: "3301", match: "code" },
  { code: "3303", name: "武陵", kind: "station", county: "臺中市", cityCode: "TCH", town: "和平區", lat: 24.397403, lng: 121.306881, ffwiCode: "3303", match: "code" },
  { code: "3401", name: "麗陽", kind: "station", county: "臺中市", cityCode: "TCH", town: "和平區", lat: 24.198376, lng: 120.999764, ffwiCode: "3401", match: "code" },
  { code: "4102", name: "土城", kind: "station", county: "南投縣", cityCode: "NTO", town: "草屯鎮", lat: 23.984981, lng: 120.746839, ffwiCode: "4102", match: "code" },
  { code: "4205", name: "奧萬大", kind: "station", county: "南投縣", cityCode: "NTO", town: "仁愛鄉", lat: 23.955199, lng: 121.170589, ffwiCode: "4205", match: "code" },
  { code: "4309", name: "人倫", kind: "station", county: "南投縣", cityCode: "NTO", town: "信義鄉", lat: 23.71232, lng: 120.908205, ffwiCode: "4309", match: "code" },
  { code: "4405", name: "二分所", kind: "station", county: "南投縣", cityCode: "NTO", town: "信義鄉", lat: 23.778566, lng: 121.044939, ffwiCode: "4405", match: "code" },
  { code: "4502", name: "杉林溪", kind: "station", county: "南投縣", cityCode: "NTO", town: "竹山鎮", lat: 23.639679, lng: 120.792008, ffwiCode: "4502", match: "code" },
  { code: "5101", name: "阿里山", kind: "station", county: "嘉義縣", cityCode: "CYH", town: "阿里山鄉", lat: 23.515639, lng: 120.810711, ffwiCode: "5101", match: "code" },
  { code: "5201", name: "奮起湖", kind: "station", county: "嘉義縣", cityCode: "CYH", town: "竹崎鄉", lat: 23.493766, lng: 120.699714, ffwiCode: "5201", match: "code" },
  { code: "5301", name: "觸口", kind: "station", county: "嘉義縣", cityCode: "CYH", town: "番路鄉", lat: 23.453591, lng: 120.559301, ffwiCode: "5301", match: "code" },
  { code: "5401", name: "玉井", kind: "station", county: "臺南市", cityCode: "TNN", town: "玉井區", lat: 23.120417, lng: 120.459082, ffwiCode: "5401", match: "code" },
  { code: "6101", name: "旗山", kind: "station", county: "高雄市", cityCode: "KCG", town: "旗山區", lat: 22.887024, lng: 120.480538, ffwiCode: "6101", match: "code" },
  { code: "6102", name: "甲仙", kind: "station", county: "高雄市", cityCode: "KCG", town: "甲仙區", lat: 23.082564, lng: 120.588894, ffwiCode: "6102", match: "code" },
  { code: "6201", name: "六龜", kind: "station", county: "高雄市", cityCode: "KCG", town: "六龜區", lat: 22.993298, lng: 120.64534, ffwiCode: "6201", match: "code" },
  { code: "6301", name: "恆春", kind: "station", county: "屏東縣", cityCode: "PTH", town: "恆春鎮", lat: 22.001194, lng: 120.746163, ffwiCode: "6301", match: "code" },
  { code: "6401", name: "潮州", kind: "station", county: "屏東縣", cityCode: "PTH", town: "潮州鎮", lat: 22.554328, lng: 120.548832, ffwiCode: "6401", match: "code" },
  { code: "7101", name: "關山", kind: "station", county: "臺東縣", cityCode: "TTT", town: "關山鎮", lat: 23.04741, lng: 121.160554, ffwiCode: "7101", match: "code" },
  { code: "7201", name: "知本", kind: "station", county: "臺東縣", cityCode: "TTT", town: "臺東市", lat: 22.704882, lng: 121.039958, ffwiCode: "7201", match: "code" },
  { code: "7301", name: "大武", kind: "station", county: "臺東縣", cityCode: "TTT", town: "大武鄉", lat: 22.356983, lng: 120.903439, ffwiCode: "7301", match: "code" },
  { code: "7401", name: "成功", kind: "station", county: "臺東縣", cityCode: "TTT", town: "成功鎮", lat: 23.100214, lng: 121.380722, ffwiCode: "7401", match: "code" },
  { code: "8101", name: "新城", kind: "station", county: "花蓮縣", cityCode: "HUA", town: "新城鄉", lat: 24.126452, lng: 121.652969, ffwiCode: "8101", match: "code" },
  { code: "8201", name: "南華", kind: "station", county: "花蓮縣", cityCode: "HUA", town: "吉安鄉", lat: 23.945691, lng: 121.54837, ffwiCode: "8201", match: "code" },
  { code: "8301", name: "萬榮", kind: "station", county: "花蓮縣", cityCode: "HUA", town: "萬榮鄉", lat: 23.717625, lng: 121.397556, ffwiCode: "8301", match: "code" },
  { code: "8401", name: "玉里", kind: "station", county: "花蓮縣", cityCode: "HUA", town: "玉里鎮", lat: 23.343225, lng: 121.318088, ffwiCode: "8401", match: "code" },
];

const SITE_BY_CODE = new Map<string, ForestFireSiteSeed>(
  FOREST_FIRE_SITES.map((site) => [site.code, site]),
);

export const getForestFireSite = (code: string): ForestFireSiteSeed | undefined =>
  SITE_BY_CODE.get(String(code));

const hasUsableCoordinates = (site: { lat?: unknown; lng?: unknown } | undefined): boolean =>
  !!site &&
  typeof site.lat === "number" &&
  typeof site.lng === "number" &&
  Number.isFinite(site.lat) &&
  Number.isFinite(site.lng) &&
  !(site.lat === 0 && site.lng === 0);

/**
 * Returns the codes (in input order) that have no seed entry or no usable
 * coordinates — the guard behind the "all 61 locations have coordinates" test.
 */
export const listSitesMissingCoordinates = (
  codes: readonly string[],
  seed: ReadonlyArray<{ code: string; lat?: unknown; lng?: unknown }> = FOREST_FIRE_SITES,
): string[] => {
  const byCode = new Map(seed.map((site) => [String(site.code), site]));
  return codes.filter((code) => !hasUsableCoordinates(byCode.get(String(code))));
};
