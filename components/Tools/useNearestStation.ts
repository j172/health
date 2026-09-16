"use client";

import { useEffect, useState } from "react";
import { useGeolocation } from "@/components/Facilities/useGeolocation";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";

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
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsFetching(true);
    fetchWithTimeout(`${endpoint}?lat=${location.lat}&lng=${location.lng}`, { timeoutMs: 5000 })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted) {
          setResolved({ lat: location.lat, lng: location.lng, station: data?.station ?? null });
          setIsFetching(false);
        }
      })
      .catch((err) => {
        console.error(`Nearest station fetch error (${endpoint}):`, err);
        if (isMounted) {
          setResolved({ lat: location.lat, lng: location.lng, station: null });
          setIsFetching(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [location.lat, location.lng, endpoint]);

  const station = resolved?.station ?? null;
  // 座標已更新但這組座標的測站資料還在抓
  const isFetchingStation = isFetching || (!resolved || resolved.lat !== location.lat || resolved.lng !== location.lng);
  const showSpinner = isFetchingStation && !station;
  const isRefreshing = location.refreshing || (isFetchingStation && station !== null);

  return {
    station,
    showSpinner,
    isRefreshing,
    isDefault: location.isDefault,
    refresh: location.refresh,
  };
}
