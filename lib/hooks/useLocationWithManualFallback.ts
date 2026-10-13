"use client";

import { useMemo, useState } from "react";
import { useSharedGeolocation, type SharedGeolocationResult } from "@/lib/hooks/useSharedGeolocation";
import { TAIWAN_COUNTY_CENTROIDS } from "@/lib/constants/taiwanDistricts";

/**
 * issue #478（母票 #438 §K）：把 `components/Nearby/NearbyContent.tsx`（#466）
 * 與 `components/Home/HomeStatusBar.tsx`（#472）已經各自實作過一次的「GPS 定位
 * 優先、使用者手動選擇的縣市次之，兩者都沒有時絕不套用任何預設座標」邏輯抽成
 * 共用 hook，給這張票要遷移的其餘呼叫點重複使用，避免每個檔案各自重新實作一
 * 次同樣的手動選擇 fallback 狀態。
 *
 * 回傳的 `effectiveCoords` 是唯一該被下游資料請求/地圖渲染使用的座標來源：
 * `null` 代表「目前沒有任何可用座標」（還在定位中，或拒絕/逾時/不支援但使用者
 * 尚未手動選擇縣市）——呼叫端此時必須顯示明確的手動選擇提示（見
 * `components/Common/MapLocationBanner.tsx`），不能自行套用任何固定座標。
 */
export interface LocationWithManualFallback {
  geolocation: SharedGeolocationResult;
  manualCounty: string;
  manualDistrict: string;
  setManualCounty: (county: string) => void;
  setManualDistrict: (district: string) => void;
  /** GPS 座標優先；使用者手動選擇的縣市次之；兩者都沒有時為 null。 */
  effectiveCoords: { lat: number; lng: number } | null;
  /** true 代表目前的 effectiveCoords 來自使用者手動選擇的縣市，不是真實 GPS 定位。 */
  hasManualCoords: boolean;
}

/**
 * `override` — issue #463 的 `?lat=&lng=` 深連結覆寫座標（有效時）：優先於
 * GPS 與手動選擇的縣市，且完全跳過瀏覽器定位流程本身（透過
 * `useSharedGeolocation({ skip: true })`），不觸發任何權限彈窗。沒有提供
 * （或座標無效）時行為等同不帶參數呼叫。
 */
export function useLocationWithManualFallback(
  override?: { lat: number; lng: number } | null,
): LocationWithManualFallback {
  const hasOverride = override != null && Number.isFinite(override.lat) && Number.isFinite(override.lng);
  const geolocation = useSharedGeolocation({ skip: hasOverride });
  const [manualCounty, setManualCounty] = useState("");
  const [manualDistrict, setManualDistrict] = useState("");

  const manualCoords = useMemo(() => {
    if (!manualCounty) return null;
    const centroid = TAIWAN_COUNTY_CENTROIDS[manualCounty];
    return centroid ? { lat: centroid.lat, lng: centroid.lng } : null;
  }, [manualCounty]);

  const effectiveCoords = hasOverride ? { lat: override!.lat, lng: override!.lng } : geolocation.coords ?? manualCoords;

  return {
    geolocation,
    manualCounty,
    manualDistrict,
    setManualCounty,
    setManualDistrict,
    effectiveCoords,
    hasManualCoords: !hasOverride && manualCoords !== null,
  };
}
