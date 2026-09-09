"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 預設位置：台北101（找不到定位時的退回點） */
export const GEO_DEFAULTS = { lat: 25.033, lng: 121.5654 };

/** 權限已有結果（granted/denied）時的定位逾時 — 兩者都幾乎立刻回應，不需要久等。 */
const DECIDED_TIMEOUT_MS = 8000;
/**
 * 權限尚未決定（prompt）時的定位逾時。這種狀態代表瀏覽器原生的授權彈窗才剛
 * 跳出來，使用者可能還沒注意到、或正在猶豫——不該用一個猜測的短秒數去跟
 * 使用者的反應時間賽跑：8 秒一到就判定「取得失敗」、直接退回預設位置開始
 * 顯示資料，等使用者真的點下「允許」時已經來不及、也不會自動重試（2026-09-09
 * 使用者回報：「還沒選擇竟直接定位在台北101」）。仍保留一個寬鬆的保險值，
 * 避免彈窗被晾在那邊時頁面永遠停在等待狀態。
 */
const PROMPT_TIMEOUT_MS = 60_000;

export interface GeolocationTimeoutResolution {
  timeoutMs: number;
  /** true 代表目前是真正「尚未決定」（prompt）的狀態——呼叫端接下來是在等使用者對原生彈窗做出選擇，不只是在等 API 呼叫本身。 */
  awaitingPermission: boolean;
}

/**
 * 依瀏覽器目前的定位權限狀態（透過 Permissions API，若支援）決定
 * getCurrentPosition 該等多久才放棄，而不是永遠用同一個固定的短秒數去賭。
 * 全站所有會呼叫 navigator.geolocation.getCurrentPosition 的地方都應該用
 * 這個函式取得 timeout，維持一致的行為（見這次修正的各呼叫點）。
 * Permissions API 不可用或丟例外時（部分較舊的 Safari）退回原本的短秒數，
 * 不影響既有相容性。
 */
export async function resolveGeolocationTimeout(decidedTimeoutMs: number = DECIDED_TIMEOUT_MS, promptTimeoutMs: number = PROMPT_TIMEOUT_MS): Promise<GeolocationTimeoutResolution> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return { timeoutMs: decidedTimeoutMs, awaitingPermission: false };
  }
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state === "prompt" ? { timeoutMs: promptTimeoutMs, awaitingPermission: true } : { timeoutMs: decidedTimeoutMs, awaitingPermission: false };
  } catch {
    return { timeoutMs: decidedTimeoutMs, awaitingPermission: false };
  }
}

interface GeoState {
  lat: number;
  lng: number;
  /** true 代表定位失敗，使用預設位置 */
  isDefault: boolean;
  loading: boolean;
  /** true 代表使用者手動觸發的重新定位進行中；此時 lat/lng 仍是舊值，畫面不清空 */
  refreshing: boolean;
  /** true 代表正在等待使用者回應瀏覽器的原生定位權限彈窗（尚未決定，見 resolveGeolocationTimeout）。呼叫端可用這個欄位跟一般 loading 區分,顯示「請允許定位權限」之類的提示，而不是讓使用者以為頁面卡住。 */
  awaitingPermission: boolean;
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
    awaitingPermission: false,
  });
  const attempted = useRef(false);

  const locate = useCallback(async (maximumAge: number, mode: "initial" | "refresh") => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((prev) => ({ ...prev, loading: false, refreshing: false, awaitingPermission: false }));
      return;
    }

    const { timeoutMs, awaitingPermission } = await resolveGeolocationTimeout();
    setState((prev) => ({ ...prev, awaitingPermission }));

    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ lat: pos.coords.latitude, lng: pos.coords.longitude, isDefault: false, loading: false, refreshing: false, awaitingPermission: false }),
      () => {
        if (mode === "initial") {
          setState({ lat: GEO_DEFAULTS.lat, lng: GEO_DEFAULTS.lng, isDefault: true, loading: false, refreshing: false, awaitingPermission: false });
        } else {
          // 手動重新定位失敗：保留原本位置，只清掉 refreshing 狀態
          setState((prev) => ({ ...prev, refreshing: false, awaitingPermission: false }));
        }
      },
      { timeout: timeoutMs, maximumAge },
    );
  }, []);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    locate(300_000, "initial");
  }, [locate]);

  const refresh = useCallback(() => {
    setState((prev) => ({ ...prev, refreshing: true }));
    locate(0, "refresh");
  }, [locate]);

  return { ...state, refresh };
}
