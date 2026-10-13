"use client";

import { useSharedGeolocation } from "@/lib/hooks/useSharedGeolocation";
import { useSidebarWidgetData } from "@/components/Tools/useSidebarWidgetData";

export interface NearestStationResult<T> {
  station: T | null;
  showSpinner: boolean;
  isRefreshing: boolean;
  /**
   * issue #478：取代舊版的 `isDefault`。true 代表拒絕/逾時/不支援，目前沒有
   * 任何真正的座標可用——跟舊版不同，這個狀態下**完全不會發起任何座標相關
   * 的請求**（見下方 `buildUrl` 回傳 `null` 時 `useSidebarWidgetData` 直接跳
   * 過 fetch），所以 `station` 這時一定是 `null`，不會是「看起來像在你附近，
   * 其實是臺北101」的猜測資料。呼叫端應顯示明確的手動選擇提示（這類側邊小
   * 工具通常沒有空間放完整的縣市選擇器，因此導向頁面上既有的「查看全台地
   * 圖」連結即可，不需要另外加一個）。
   */
  needsManualSelection: boolean;
  /**
   * True when the most recent fetch (mount or refresh) failed. `station`
   * may still be non-null in this case — a refresh failure deliberately
   * keeps the last known-good station instead of clobbering it with
   * `null`, so callers should check this flag rather than inferring
   * failure from `station === null`.
   */
  hasError: boolean;
  refresh: () => void;
}

/**
 * Resolves the user's geolocation via the shared `useSharedGeolocation` hook
 * (issue #477/#478 — never a hardcoded default coordinate), then fetches the
 * nearest station from `endpoint?lat=&lng=`. Shared by AqiSidebarWidget /
 * UvSidebarWidget — only the endpoint and the station's shape (`T`) differ
 * between them.
 *
 * Built on top of useSidebarWidgetData: a refresh failure (timeout,
 * network error, or non-2xx from `endpoint`) no longer overwrites a
 * previously-resolved `station` with `null` — the last known-good value is
 * kept, and `hasError` is exposed so callers can show a real error/stale
 * indicator instead of silently falling back to hardcoded placeholder data.
 */
export function useNearestStation<T>(endpoint: string): NearestStationResult<T> {
  const geolocation = useSharedGeolocation();

  const { status, data, isRefreshing, refresh } = useSidebarWidgetData<T | null>({
    buildUrl: () =>
      geolocation.coords ? `${endpoint}?lat=${geolocation.coords.lat}&lng=${geolocation.coords.lng}` : null,
    parse: (json) => json?.station ?? null,
    deps: [geolocation.coords?.lat, geolocation.coords?.lng, endpoint],
  });

  const station = data ?? null;
  const geolocationPending = geolocation.status === "locating" || geolocation.status === "awaiting-permission";
  const showSpinner = status === "loading" && station === null && !geolocation.needsManualSelection;

  return {
    station,
    showSpinner,
    isRefreshing: geolocationPending || isRefreshing,
    needsManualSelection: geolocation.needsManualSelection,
    hasError: status === "error",
    refresh: () => {
      geolocation.refresh();
      refresh();
    },
  };
}
