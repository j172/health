"use client";

import { useEffect, useSyncExternalStore } from "react";
import { parseEarthquakeStatus, type EarthquakeStatus } from "@/lib/earthquake/earthquakeStatus";

/**
 * 地震速報橫幅狀態的瀏覽器端共用來源。比照 lib/client/typhoonStatusStore.ts（issue #744）。
 *
 * 全站橫幅讀這裡，同一個頁面只會有一次 /api/earthquake-status 請求（同時掛載時共用同一個
 * 進行中的 Promise；60 秒內不重抓）。
 *
 * 伺服器渲染與第一次 hydration 一律是 `null`（= 未知），所以 SSR 輸出完全不依賴地震狀態，
 * 被 Cloudflare 快取的頁面 HTML 不會帶著地震內容。fetch 失敗／逾時／格式不符 → 維持 `null`
 * 或 `{active:false}`，橫幅不顯示。
 */

export const EARTHQUAKE_STATUS_URL = "/api/earthquake-status";
const FRESH_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

let snapshot: EarthquakeStatus | null = null;
let lastFetchedAt = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

const doFetch = async (): Promise<void> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(EARTHQUAKE_STATUS_URL, {
      signal: controller.signal,
      // Cloudflare raises max-age to its 30-minute Browser Cache TTL even when the origin sends
      // max-age=0, so the browser must revalidate itself (the edge still answers from its 60 s cache).
      cache: "no-cache",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    snapshot = parseEarthquakeStatus(await response.json());
  } catch {
    // 失敗／逾時：不顯示橫幅。已經顯示中的橫幅也撤掉——寧可不顯示，也不要顯示過期的地震。
    snapshot = null;
  } finally {
    clearTimeout(timer);
    lastFetchedAt = Date.now();
    emit();
  }
};

/** 取得最新狀態；60 秒內已抓過（或正在抓）就不重抓。回傳的 Promise 永遠不會 reject。 */
export const refreshEarthquakeStatus = (force = false): Promise<void> => {
  if (inFlight) return inFlight;
  if (!force && lastFetchedAt > 0 && Date.now() - lastFetchedAt < FRESH_MS) return Promise.resolve();
  inFlight = doFetch().finally(() => {
    inFlight = null;
  });
  return inFlight;
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getEarthquakeStatusSnapshot = (): EarthquakeStatus | null => snapshot;
const getSnapshot = getEarthquakeStatusSnapshot;
const getServerSnapshot = (): EarthquakeStatus | null => null;

/**
 * 訂閱地震速報狀態。`null` = 尚未載入／載入失敗（呼叫端一律當作「沒有地震」處理）。
 * `pollMs`：只有全站橫幅傳入，之後每隔這麼久重抓一次（頁面不可見時略過）。
 */
export function useEarthquakeStatus(pollMs?: number): EarthquakeStatus | null {
  const status = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    void refreshEarthquakeStatus();
    if (!pollMs) return undefined;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refreshEarthquakeStatus();
    }, pollMs);
    return () => clearInterval(timer);
  }, [pollMs]);

  return status;
}

/** 測試用：重設模組狀態。 */
export const __resetEarthquakeStatusStoreForTests = (): void => {
  snapshot = null;
  lastFetchedAt = 0;
  inFlight = null;
  listeners.clear();
};
