/**
 * issue #478（母票 #438 §K）：地圖元件（`*MapLeaflet.tsx`／`FacilityMap.tsx`）
 * 畫「使用者目前位置」標記時共用的最小形狀，取代原本從已刪除的
 * `components/Facilities/useGeolocation.ts` 匯入的 `GeoLocation` 型別。
 *
 * 呼叫端（各 `*Content.tsx`）一律只在已經有真正的 GPS 座標或使用者手動選擇
 * 的地區座標時才傳入這個 prop（見 `lib/hooks/useLocationWithManualFallback.ts`
 * 的 `effectiveCoords`），`isDefault` 因此一律是 `false`——新架構下不再有「猜
 * 測的預設座標」這個狀態，拒絕/逾時/不支援一律改由
 * `components/Common/MapLocationBanner.tsx` 顯示手動選擇提示，不會把猜測座標
 * 傳到這裡來畫地圖。
 */
export interface MapUserLocation {
  lat: number;
  lng: number;
  isDefault: boolean;
  refresh?: () => void;
  refreshing?: boolean;
}
