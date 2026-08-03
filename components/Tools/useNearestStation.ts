"use client";

import { useEffect, useState } from "react";
import { useGeolocation } from "@/components/Facilities/useGeolocation";

interface ResolvedStation<T> {
  lat: number;
  lng: number;
  station: T | null;
}

export interface NearestStationResult<T> {
  station: T | null;
  showSpinner: boolean;
  isRefreshing: boolean;
  isDefault: boolean;
  refresh: () => void;
}

/**
 * Resolves the user's geolocation (falling back to a default point when
 * unavailable), then fetches the nearest station from `endpoint?lat=&lng=`.
 * Shared by AqiSidebarWidget / UvSidebarWidget — only the endpoint and the
 * station's shape (`T`) differ between them.
 */
export function useNearestStation<T>(endpoint: string): NearestStationResult<T> {
  const location = useGeolocation();
  const [resolved, setResolved] = useState<ResolvedStation<T> | null>(null);

  useEffect(() => {
    if (location.loading) return;
    let isMounted = true;
    fetch(`${endpoint}?lat=${location.lat}&lng=${location.lng}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted) setResolved({ lat: location.lat, lng: location.lng, station: data?.station ?? null });
      })
      .catch((err) => {
        console.error(`Nearest station fetch error (${endpoint}):`, err);
        if (isMounted) setResolved({ lat: location.lat, lng: location.lng, station: null });
      });
    return () => {
      isMounted = false;
    };
  }, [location.loading, location.lat, location.lng, endpoint]);

  const station = resolved?.station ?? null;
  // 座標已更新（例如剛完成一次定位）但這組座標的測站資料還沒抓回來
  const isFetchingStation = !location.loading && (!resolved || resolved.lat !== location.lat || resolved.lng !== location.lng);
  const showSpinner = (location.loading || isFetchingStation) && !station;
  const isRefreshing = location.refreshing || (isFetchingStation && station !== null);

  return {
    station,
    showSpinner,
    isRefreshing,
    isDefault: location.isDefault,
    refresh: location.refresh,
  };
}
