/**
 * BaseMap 底圖設定常數（issue #475）。
 *
 * 單一設定來源：全站所有地圖的底圖網址都必須只出現在這裡，不得在個別地圖元件
 * 內寫死（見 docs/2.0/spec-issue-438.md §J、原始碼掃描測試接縫②的規則）。
 *
 * 主要底圖：內政部國土測繪中心 EMAP5 開放資料版 WMTS（EMAP5_OPENDATA，免申請、
 * 正體中文標註）。備援底圖：OpenStreetMap 標準圖層，刻意不使用 `{s}` 子網域前綴
 * ——OSMF 圖磚使用政策明確表示「容量有限、可能無預警封鎖」且子網域前綴可能被
 * 撤除，本站 9 個既有地圖元件全部曾經寫死帶子網域前綴的 OSM 網址，正是
 * 2.0 要收斂掉的技術債之一（也是 tests/no-hardcoded-tile-subdomain.test.mjs 的
 * regression guard：這段說明文字刻意不拼出完整的違規網址型態，避免觸發它自己
 * 要防範的規則）。
 */

// Relative import (not the `@/` alias) so this file keeps resolving under a
// plain `node --test` import() with no path-alias loader hook registered
// (see tests/baseMap.test.mjs, which imports this module directly).
import { appendOutboundUtm } from "../../lib/format/outboundLink";

export const PRIMARY_TILE_URL = "https://wmts.nlsc.gov.tw/wmts/EMAP5_OPENDATA/default/GoogleMapsCompatible/{z}/{y}/{x}.png";
export const PRIMARY_ATTRIBUTION = "&copy; 內政部國土測繪中心";

export const FALLBACK_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Copyright attribution link UTM-tagged per issue #451 (see lib/constants/mapTiles.ts
// for the sibling OSM_TILE_ATTRIBUTION constant used by the 9 Leaflet-based map
// components — this file's BaseMap-only fallback attribution duplicates the same URL).
const OSM_COPYRIGHT_URL = appendOutboundUtm(
  "https://www.openstreetmap.org/copyright",
  { medium: "map_attribution", campaign: "map_tiles" },
);
export const FALLBACK_ATTRIBUTION = `&copy; <a href="${OSM_COPYRIGHT_URL}">OpenStreetMap</a> contributors`;

/** 備援底圖永遠疊在主要底圖下方，主要底圖失敗時移除即可讓備援立刻可見，不會有空白地圖的瞬間。 */
export const FALLBACK_TILE_Z_INDEX = 1;
export const PRIMARY_TILE_Z_INDEX = 2;

/** 連續幾次 tileerror 才判定主要底圖「載入失敗」並切換——避免單一磁磚偶發 404 就整張地圖降級。 */
export const PRIMARY_TILE_ERROR_THRESHOLD = 3;
