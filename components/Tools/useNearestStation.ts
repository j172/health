"use client";

import { useGeolocation } from "@/components/Facilities/useGeolocation";
import { useSidebarWidgetData } from "@/components/Tools/useSidebarWidgetData";

export interface NearestStationResult<T> {
  station: T | null;
  showSpinner: boolean;
  isRefreshing: boolean;
  isDefault: boolean;
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
 * Resolves the user's geolocation (falling back to a default point when
 * unavailable), then fetches the nearest station from `endpoint?lat=&lng=`.
 * Shared by AqiSidebarWidget / UvSidebarWidget — only the endpoint and the
 * station's shape (`T`) differ between them.
 *
 * Built on top of useSidebarWidgetData: a refresh failure (timeout,
 * network error, or non-2xx from `endpoint`) no longer overwrites a
 * previously-resolved `station` with `null` — the last known-good value is
 * kept, and `hasError` is exposed so callers can show a real error/stale
 * indicator instead of silently falling back to hardcoded placeholder data.
 */
export function useNearestStation<T>(endpoint: string): NearestStationResult<T> {
  const location = useGeolocation();

  const { status, data, isRefreshing, refresh } = useSidebarWidgetData<T | null>({
    buildUrl: () => `${endpoint}?lat=${location.lat}&lng=${location.lng}`,
    parse: (json) => json?.station ?? null,
    deps: [location.lat, location.lng, endpoint],
  });

  const station = data ?? null;
  const showSpinner = status === "loading" && station === null;
  const hasError = status === "error";

  return {
    station,
    showSpinner,
    isRefreshing: location.refreshing || isRefreshing,
    isDefault: location.isDefault,
    hasError,
    refresh: () => {
      location.refresh();
      refresh();
    },
  };
}
