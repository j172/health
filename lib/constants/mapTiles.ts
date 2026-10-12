/**
 * OpenStreetMap 圖磚來源設定常數。
 *
 * 依 OSMF Tile Usage Policy 建議，不要寫死帶 `{s}` 子網域參數或任何
 * 字母子網域前綴的圖磚網址——子網域可能隨時被撤除，
 * 官方建議統一使用單一主機名稱 `tile.openstreetmap.org`。
 *
 * 全站所有使用 OSM 圖磚的地圖元件都應 import 這裡的常數，
 * 而不是各自重複寫一份圖磚網址字串。
 *
 * @see https://operations.osmfoundation.org/policies/tiles/
 */
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const OSM_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
