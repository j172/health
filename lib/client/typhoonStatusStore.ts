"use client";

import { useEffect, useSyncExternalStore } from "react";
import { parseTyphoonStatus, type TyphoonStatus } from "@/lib/typhoon/typhoonStatus";

/**
 * 颱風警報狀態的瀏覽器端共用來源（issue #744）。
 *
 * 全站橫幅與首頁兩張大卡片都讀這裡，所以同一個頁面只會有一次 /api/typhoon-status 請求
 * （同時掛載時共用同一個進行中的 Promise；60 秒內不重抓）。
 *
 * 伺服器渲染與第一次 hydration 一律是 `null`（= 未知），所以 SSR 輸出完全不依賴警報，
 * 被 Cloudflare 快取的頁面 HTML 不會帶著警報狀態。fetch 失敗／逾時／格式不符 → 維持
 * `null` 或 `{active:false}`，橫幅不顯示。
 *
 * 測試模擬：網址帶 `?typhoon-sim=land|sea&typhoon-sim-key=<金鑰>` 打開任一頁，
 * 會把兩者存進該分頁的 sessionStorage，之後在同一分頁瀏覽任何頁面都會以模擬狀態請求端點
 * （金鑰不對或伺服器未設定時，端點會忽略模擬、回真實狀態）。`typhoon-sim=off` 清除。
 */

export const TYPHOON_STATUS_URL = "/api/typhoon-status";
const FRESH_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const SIM_STORAGE_KEY = "typhoonSim";
const SIM_KEY_STORAGE_KEY = "typhoonSimKey";
const SIM_PARAM = "typhoon-sim";
const SIM_KEY_PARAM = "typhoon-sim-key";

let snapshot: TyphoonStatus | null = null;
let lastFetchedAt = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

const readSimulation = (): { sim: "land" | "sea"; key: string } | null => {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get(SIM_PARAM);
    if (fromUrl === "off") {
      window.sessionStorage.removeItem(SIM_STORAGE_KEY);
      window.sessionStorage.removeItem(SIM_KEY_STORAGE_KEY);
    } else if ((fromUrl === "land" || fromUrl === "sea") && params.get(SIM_KEY_PARAM)) {
      window.sessionStorage.setItem(SIM_STORAGE_KEY, fromUrl);
      window.sessionStorage.setItem(SIM_KEY_STORAGE_KEY, params.get(SIM_KEY_PARAM) as string);
    }
    const sim = window.sessionStorage.getItem(SIM_STORAGE_KEY);
    const key = window.sessionStorage.getItem(SIM_KEY_STORAGE_KEY);
    return (sim === "land" || sim === "sea") && key ? { sim, key } : null;
  } catch {
    return null;
  }
};

const doFetch = async (): Promise<void> => {
  const simulation = readSimulation();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(simulation ? `${TYPHOON_STATUS_URL}?sim=${simulation.sim}` : TYPHOON_STATUS_URL, {
      signal: controller.signal,
      headers: simulation ? { "x-typhoon-sim-key": simulation.key } : undefined,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    snapshot = parseTyphoonStatus(await response.json());
  } catch {
    // 失敗／逾時：不顯示橫幅。已經顯示中的橫幅也撤掉——寧可不顯示，也不要顯示過期的警報。
    snapshot = null;
  } finally {
    clearTimeout(timer);
    lastFetchedAt = Date.now();
    emit();
  }
};

/** 取得最新狀態；60 秒內已抓過（或正在抓）就不重抓。回傳的 Promise 永遠不會 reject。 */
export const refreshTyphoonStatus = (force = false): Promise<void> => {
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

export const getTyphoonStatusSnapshot = (): TyphoonStatus | null => snapshot;
const getSnapshot = getTyphoonStatusSnapshot;
const getServerSnapshot = (): TyphoonStatus | null => null;

/**
 * 訂閱颱風警報狀態。`null` = 尚未載入／載入失敗（呼叫端一律當作「沒有警報」處理）。
 * `pollMs`：只有全站橫幅傳入，之後每隔這麼久重抓一次（頁面不可見時略過）。
 */
export function useTyphoonStatus(pollMs?: number): TyphoonStatus | null {
  const status = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    void refreshTyphoonStatus();
    if (!pollMs) return undefined;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refreshTyphoonStatus();
    }, pollMs);
    return () => clearInterval(timer);
  }, [pollMs]);

  return status;
}

/** 測試用：重設模組狀態。 */
export const __resetTyphoonStatusStoreForTests = (): void => {
  snapshot = null;
  lastFetchedAt = 0;
  inFlight = null;
  listeners.clear();
};
