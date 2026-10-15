/**
 * 讀取使用者在「在地天氣」等元件手動選定的縣市位置（`localStorage` 的
 * `user_selected_location`）。這只是一個純讀取的小工具，與瀏覽器定位無關——
 * 它原本和已刪除的舊版 `components/Facilities/useGeolocation.ts` 放在同一個
 * 檔案，該檔案其餘部分（`useGeolocation` hook 與重複的逾時邏輯）在全站定位
 * 收斂為 `lib/hooks/useSharedGeolocation.ts` 之後已無呼叫者而移除
 * （母票 #438 §K）。
 *
 * 只在瀏覽器端呼叫（SSR／無 `window` 時回傳 `null`），且絕不在 `useState`
 * 初始值裡同步呼叫，否則會造成 hydration mismatch（React 418），見
 * `tests/hydration-and-image-resilience.test.mjs`。
 */
export function getSavedLocation(): { lat: number; lng: number; name?: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user_selected_location");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat === "number" && typeof parsed?.lng === "number") {
      return parsed;
    }
  } catch {}
  return null;
}
