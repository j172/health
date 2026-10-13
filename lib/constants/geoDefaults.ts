/**
 * issue #478（母票 #438 §K）：地圖元件在「尚未取得任何座標」時，Leaflet
 * `MapContainer` 的 `center` prop仍需要一組數值才能初始化——這個常數純粹是那個
 * 初始渲染用的數值安全網，不代表、也絕不能被呈現成「使用者的位置」。
 *
 * 這跟舊版 `components/Facilities/useGeolocation.ts` 的同名常數不同：舊版會在
 * 定位被拒絕／逾時時，把這個座標當成使用者的「預設位置」靜默套用並顯示地圖
 * （正是 2.0 改版要修正的 bug class）。新架構下，呼叫端一律只在
 * `useSharedGeolocation()`/`useLocationWithManualFallback()` 已經有真正的 GPS
 * 座標或使用者手動選擇的地區座標時才渲染地圖——這個常數因此只會在地圖元件
 * 自身的型別要求下被當作「還沒拿到座標前」的 fallback 使用，實務上不會被使用
 * 者看到。
 */
export const GEO_DEFAULTS = { lat: 25.033, lng: 121.5654 } as const;
