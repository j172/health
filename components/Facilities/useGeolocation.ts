"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 預設位置：台北101（找不到定位時的退回點） */
export const GEO_DEFAULTS = { lat: 25.033, lng: 121.5654 };

interface GeoState {
  lat: number;
  lng: number;
  /** true 代表定位失敗，使用預設位置 */
  isDefault: boolean;
  loading: boolean;
  /** true 代表使用者手動觸發的重新定位進行中；此時 lat/lng 仍是舊值，畫面不清空 */
  refreshing: boolean;
}

export interface GeoLocation extends GeoState {
  /** 手動重新定位，略過瀏覽器快取，強制取得最新位置 */
  refresh: () => void;
}

/** 自動觸發瀏覽器定位，失敗則退回台北101預設位置；也可透過 refresh() 手動重新定位。 */
export function useGeolocation(): GeoLocation {
  const [state, setState] = useState<GeoState>({
    lat: GEO_DEFAULTS.lat,
    lng: GEO_DEFAULTS.lng,
    isDefault: true,
    loading: true,
    refreshing: false,
  });
  const attempted = useRef(false);

  const locate = useCallback((options: PositionOptions, mode: "initial" | "refresh") => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((prev) => ({ ...prev, loading: false, refreshing: false }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ lat: pos.coords.latitude, lng: pos.coords.longitude, isDefault: false, loading: false, refreshing: false }),
      () => {
        if (mode === "initial") {
          setState({ lat: GEO_DEFAULTS.lat, lng: GEO_DEFAULTS.lng, isDefault: true, loading: false, refreshing: false });
        } else {
          // 手動重新定位失敗：保留原本位置，只清掉 refreshing 狀態
          setState((prev) => ({ ...prev, refreshing: false }));
        }
      },
      options,
    );
  }, []);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    locate({ timeout: 8000, maximumAge: 300_000 }, "initial");
  }, [locate]);

  const refresh = useCallback(() => {
    setState((prev) => ({ ...prev, refreshing: true }));
    locate({ timeout: 8000, maximumAge: 0 }, "refresh");
  }, [locate]);

  return { ...state, refresh };
}
