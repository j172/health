import { httpGetText } from "@/lib/server/net/httpClient";

// 經濟部水利署水資源物聯網 (iot.wra.gov.tw) — 即時淹水範圍圖可用區域清單, issue #270.
// Confirmed live (2026-09-15): no API key required. Returns a bare JSON array
// of English county-code slugs (e.g. "changhua") — 12 items verified live,
// matching the swagger doc's `/rasterMap/inundation/regions` path.
//
// The full raster overlay itself (`/rasterMap/inundation/{region}`, an image
// endpoint) is intentionally NOT implemented here — issue #270 explicitly
// allows shipping just this "which counties currently have inundation-map
// data available" list/indicator instead of a full Leaflet ImageOverlay,
// given the added complexity (tile georeferencing, refresh cadence, styling)
// of the latter. See docs/specs/disaster-map-wra-iot-realtime-layers.md §2.3.
//
// Licensing note: see fetchDamStructureStations.ts's comment (same swagger
// doc, same unconfirmed-licence posture) and the PR description.
const INUNDATION_REGIONS_URL = "https://iot.wra.gov.tw/rasterMap/inundation/regions";

// The endpoint's slugs are English county codes with no Chinese label of
// their own; this maps them for display. Extend as needed if the source ever
// adds more regions — an unknown slug still renders (falls back to itself).
const REGION_LABELS: Record<string, string> = {
  changhua: "彰化縣",
  chiayi: "嘉義縣市",
  hsinchu: "新竹縣市",
  kaohsiung: "高雄市",
  miaoli: "苗栗縣",
  peipeikeelung: "北北基",
  pingtung: "屏東縣",
  taichung: "臺中市",
  tainan: "臺南市",
  taoyuan: "桃園市",
  yilan: "宜蘭縣",
  yunlin: "雲林縣",
};

export interface InundationRegion {
  code: string;
  label: string;
}

let cache: { data: InundationRegion[]; expiresAt: number } | null = null;
// 10 minutes — this is a "which counties currently have data" indicator, not
// per-minute telemetry; the list changes rarely, so avoid hitting the
// upstream on every disaster-map page load.
const CACHE_TTL_MS = 10 * 60 * 1000;

/** Fetches (with a short in-memory cache) the list of counties iot.wra.gov.tw currently has inundation-map data for. No DB table — see module doc above. */
export async function getInundationRegions(): Promise<InundationRegion[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.data;

  const { status, text } = await httpGetText(INUNDATION_REGIONS_URL, { timeoutMs: 15_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`WRA IoT rasterMap/inundation/regions request failed: HTTP ${status}`);
  }

  const parsed: unknown = JSON.parse(text);
  const codes = Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  const data: InundationRegion[] = codes.map((code) => ({
    code,
    label: REGION_LABELS[code] ?? code,
  }));

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
