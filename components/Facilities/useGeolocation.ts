"use client";

import { useEffect, useRef, useState } from "react";

/** 預設位置：台北市政府（找不到定位時的退回點） */
export const GEO_DEFAULTS = { lat: 25.0375, lng: 121.5637 };

export interface GeoLocation {
  lat: number;
  lng: number;
  /** true 代表定位失敗，使用預設位置 */
  isDefault: boolean;
  loading: boolean;
}

/** 自動觸發瀏覽器定位，失敗則退回台北市政府預設位置。 */
export function useGeolocation(): GeoLocation {
  const [state, setState] = useState<GeoLocation>({ lat: GEO_DEFAULTS.lat, lng: GEO_DEFAULTS.lng, isDefault: true, loading: true });
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ lat: pos.coords.latitude, lng: pos.coords.longitude, isDefault: false, loading: false }),
      () => setState({ lat: GEO_DEFAULTS.lat, lng: GEO_DEFAULTS.lng, isDefault: true, loading: false }),
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, []);

  return state;
}
