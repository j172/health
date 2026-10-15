"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 共用定位 hook（issue #477，母票 #438 §K：「全站定位收斂為單一 hook」）。
 *
 * 這是全站要收斂成「單一定位 hook」的新實作，但本票刻意**不**取代任何既有
 * 呼叫點（那是後續的 #478）——目前全站約 25 個地方各自呼叫
 * `navigator.geolocation`，且曾在 4 個不同地方各自修過同一個「逾時邏輯
 * 沒有等瀏覽器自己的授權彈窗被使用者回應」的 bug（見
 * `components/Facilities/useGeolocation.ts` 的 `resolveGeolocationTimeout`，
 * 2026-09-09 修正）。這支 hook 延續那個修正的演算法——Permissions API 存在
 * 時依目前的授權狀態（`granted`／`denied` 幾乎立刻回應 vs. `prompt` 給使用者
 * 足夠時間回應原生彈窗）決定逾時秒數——並額外補上兩件事：
 *
 *   1. 拒絕或逾時都回報明確的終態（`"denied"` / `"timeout"`），而不是像舊版
 *      那樣靜默套用臺北101預設座標；呼叫端應該依 `needsManualSelection`
 *      顯示「手動選擇縣市／鄉鎮」的提示。
 *   2. 定位結果（成功或終態失敗）快取在 sessionStorage，同一次瀏覽階段內
 *      不同頁面重新 mount 這個 hook 都直接讀快取，不會重新呼叫
 *      `getCurrentPosition`，也就不會再跳出瀏覽器的原生授權彈窗。只有呼叫
 *      端主動呼叫 `refresh()`（明確的使用者動作）才會略過快取、重新嘗試。
 *
 * 本檔案不依賴任何既有頁面或元件，可獨立測試（見
 * `tests/useSharedGeolocation.test.mjs`）。
 */

/** 權限已有結果（granted/denied）時的定位逾時——兩者都幾乎立刻回應，不需要久等。 */
export const DECIDED_TIMEOUT_MS = 6000;
/**
 * 權限尚未決定（prompt）時的定位逾時。給使用者足夠時間注意並回應原生彈窗，
 * 逾時後才判定為 timeout，不會在彈窗還開著、使用者還沒反應時就判定逾時。
 */
export const PROMPT_TIMEOUT_MS = 12_000;

/** 快取整次瀏覽階段的定位結果，全站共用（見檔案頂端說明）。 */
export const SHARED_GEOLOCATION_SESSION_KEY = "sharedGeolocation:v1";

export type SharedGeolocationStatus =
  | "idle"
  | "awaiting-permission"
  | "locating"
  | "success"
  | "denied"
  | "timeout"
  | "unsupported";

export interface SharedGeolocationCoords {
  lat: number;
  lng: number;
}

export interface SharedGeolocationResult {
  status: SharedGeolocationStatus;
  coords: SharedGeolocationCoords | null;
  /**
   * true 代表目前是「尚未決定」（prompt）狀態——呼叫端接下來是在等使用者對
   * 原生彈窗做出選擇，不只是在等 API 呼叫本身，可用來跟一般 loading 區分，
   * 顯示「請允許定位權限」之類的提示而不是讓使用者以為頁面卡住。
   */
  awaitingPermission: boolean;
  /**
   * true 代表已經確定拿不到定位（使用者拒絕、逾時，或瀏覽器不支援 Geolocation
   * API），且沒有任何快取結果可用——呼叫端應該顯示手動選擇縣市／鄉鎮的提示，
   * 而不是靜默套用固定地點。
   */
  needsManualSelection: boolean;
  /**
   * 使用者主動重試：清掉 sessionStorage 快取、重新嘗試一次定位。這是唯一
   * 允許再跳出瀏覽器原生授權彈窗的路徑（一般 mount 一律先看快取）。
   */
  refresh: () => void;
}

interface GeolocationOutcome {
  status: "success" | "denied" | "timeout" | "unsupported";
  lat?: number;
  lng?: number;
}

export interface PermissionAwareTimeout {
  timeoutMs: number;
  awaitingPermission: boolean;
}

/**
 * 依瀏覽器目前的定位權限狀態（透過 Permissions API，若支援）決定
 * `getCurrentPosition` 該等多久才放棄，而不是永遠用同一個固定的短秒數去賭
 * ——這就是 2026-09-09 修正過的「逾時沒有等授權彈窗被回應」bug 的演算法。
 * Permissions API 不可用或丟例外時（部分較舊的 Safari）退回原本的短秒數，
 * 不影響既有相容性。
 *
 * 舊版 `components/Facilities/useGeolocation.ts` 的 `resolveGeolocationTimeout`
 * 是同一套邏輯的獨立實作；#478 把呼叫點改用這支共用 hook 之後，舊檔案已整個
 * 刪除。母票 #438 §K 要求 `navigator.geolocation` 只能出現在本檔案，由
 * `tests/geolocation-hook-only.test.mjs` 掃描強制。
 */
export async function resolvePermissionAwareTimeout(
  decidedTimeoutMs: number = DECIDED_TIMEOUT_MS,
  promptTimeoutMs: number = PROMPT_TIMEOUT_MS,
): Promise<PermissionAwareTimeout> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return { timeoutMs: decidedTimeoutMs, awaitingPermission: false };
  }
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state === "prompt"
      ? { timeoutMs: promptTimeoutMs, awaitingPermission: true }
      : { timeoutMs: decidedTimeoutMs, awaitingPermission: false };
  } catch {
    return { timeoutMs: decidedTimeoutMs, awaitingPermission: false };
  }
}

function readSessionCache(): GeolocationOutcome | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SHARED_GEOLOCATION_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.status === "string") return parsed as GeolocationOutcome;
  } catch {
    // 壞掉的快取視同沒有快取，不丟例外、不擋住後續的定位流程
  }
  return null;
}

function writeSessionCache(outcome: GeolocationOutcome): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SHARED_GEOLOCATION_SESSION_KEY, JSON.stringify(outcome));
  } catch {
    // 無痕模式／儲存空間已滿等情況：快取只是效能最佳化，寫入失敗不影響正確性
  }
}

function clearSessionCache(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SHARED_GEOLOCATION_SESSION_KEY);
  } catch {
    // ignore
  }
}

/** 同一頁面內多個元件同時掛載這個 hook 時，共用同一個進行中的定位請求，不會各自觸發一次 getCurrentPosition（也就不會各自跳出一次授權彈窗）。 */
let inFlightRequest: Promise<GeolocationOutcome> | null = null;

function requestBrowserLocation(onAwaitingPermission: (awaiting: boolean) => void): Promise<GeolocationOutcome> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ status: "unsupported" });
  }
  return resolvePermissionAwareTimeout().then(({ timeoutMs, awaitingPermission }) => {
    onAwaitingPermission(awaitingPermission);
    return new Promise<GeolocationOutcome>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ status: "success", lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          // GeolocationPositionError：1 = PERMISSION_DENIED，2 = POSITION_UNAVAILABLE，
          // 3 = TIMEOUT。2、3 對呼叫端而言都是「自動定位拿不到結果」，一律視為
          // timeout；只有明確的 1 才是使用者主動拒絕授權，兩者分開回報。
          resolve({ status: err.code === 1 ? "denied" : "timeout" });
        },
        { timeout: timeoutMs, maximumAge: 0 },
      );
    });
  });
}

/**
 * 解析定位結果：非強制重試時，有 sessionStorage 快取就直接回傳，完全不會
 * 碰瀏覽器定位 API——這就是「同一瀏覽階段內不同頁面不會重複跳出授權詢問」
 * 的實作方式；若同一頁面已經有進行中的請求，一併共用那個請求而不是重新發起
 * 第二個。`forceRefresh` 時一律略過快取，重新嘗試一次。
 */
export function resolveSharedLocation(
  options: {
    forceRefresh?: boolean;
    onAwaitingPermission?: (awaiting: boolean) => void;
    /**
     * `false` 時完全不讀、不寫、不清 sessionStorage 快取，也不與其他進行中的
     * 請求共用——每次呼叫都是一次獨立、用完即丟的瀏覽器定位。給「不得在瀏覽器
     * 留下任何紀錄」的頁面使用（例如 `/tools/social-welfare-centers`，見 issue
     * #603）。預設 `true`。
     */
    persist?: boolean;
  } = {},
): Promise<GeolocationOutcome> {
  const { forceRefresh = false, onAwaitingPermission = () => {}, persist = true } = options;

  if (!persist) return requestBrowserLocation(onAwaitingPermission);

  if (!forceRefresh) {
    const cached = readSessionCache();
    if (cached) return Promise.resolve(cached);
    if (inFlightRequest) return inFlightRequest;
  }

  const request = requestBrowserLocation(onAwaitingPermission).then((outcome) => {
    writeSessionCache(outcome);
    if (inFlightRequest === request) inFlightRequest = null;
    return outcome;
  });
  inFlightRequest = request;
  return request;
}

/** 測試用：重設模組層級的 in-flight 請求／快取存取都是透過真正的 sessionStorage，這裡只需重設記憶體狀態。正常使用情境下不需要呼叫。 */
export function __resetSharedGeolocationModuleStateForTests(): void {
  inFlightRequest = null;
}

function coordsFromOutcome(outcome: GeolocationOutcome): SharedGeolocationCoords | null {
  return outcome.status === "success" && typeof outcome.lat === "number" && typeof outcome.lng === "number"
    ? { lat: outcome.lat, lng: outcome.lng }
    : null;
}

export interface UseSharedGeolocationOptions {
  /**
   * issue #478：少數呼叫點（`FacilitySearchContent`／`AedContent`）支援
   * `?lat=&lng=` 深連結覆寫座標（issue #463）——覆寫座標存在時，過去的
   * `useGeolocation(override)` 會完全不碰瀏覽器定位 API，不觸發任何權限彈
   * 窗。這支 hook 不能依賴「呼叫端有條件地呼叫 hook」（違反 React hooks 規
   * 則），所以用這個旗標達到同樣效果：`skip: true` 時完全不執行定位流程
   * （不讀快取、不呼叫 `getCurrentPosition`），`status` 永遠停在 `"idle"`。
   * 預設 `false`，與既有呼叫端（`NearbyContent`／`HomeStatusBar`）完全相容。
   */
  skip?: boolean;
  /**
   * 預設 `true`：結果快取在 sessionStorage、同一瀏覽階段內跨頁共用（見檔案
   * 頂端說明）。`false` 時這支 hook 完全不碰任何瀏覽器儲存空間——mount 時不
   * 讀快取、定位完成後不寫入、`refresh()` 也不清除既有快取，結果只存在這個
   * hook 實例的 React state。給「不得在瀏覽器留下任何紀錄」的頁面使用（例如
   * 社福中心與社工求助頁，issue #603：使用者可能正在避開同住者的查看）。
   * 通常搭配 `skip: true` 達到「只在使用者明確按下按鈕、呼叫 `refresh()` 時
   * 才定位」的效果。
   */
  persist?: boolean;
}

/**
 * 全站共用的定位 hook。見檔案頂端說明：逾時邏輯會正確等待原生授權彈窗、
 * 拒絕或逾時回報明確狀態（不靜默套用預設座標）、同一瀏覽階段內不重複跳出
 * 授權詢問。
 */
export function useSharedGeolocation(options: UseSharedGeolocationOptions = {}): SharedGeolocationResult {
  const { skip = false, persist = true } = options;
  const [status, setStatus] = useState<SharedGeolocationStatus>("idle");
  const [coords, setCoords] = useState<SharedGeolocationCoords | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const run = useCallback((forceRefresh: boolean) => {
    if (persist && !forceRefresh) {
      const cached = readSessionCache();
      if (cached) {
        setStatus(cached.status);
        setCoords(coordsFromOutcome(cached));
        return;
      }
    }

    setStatus("locating");
    resolveSharedLocation({
      forceRefresh,
      persist,
      onAwaitingPermission: (awaiting) => {
        if (!isMountedRef.current) return;
        setStatus(awaiting ? "awaiting-permission" : "locating");
      },
    }).then((outcome) => {
      if (!isMountedRef.current) return;
      setStatus(outcome.status);
      setCoords(coordsFromOutcome(outcome));
    });
  }, [persist]);

  useEffect(() => {
    if (skip) return;
    // Deferred via queueMicrotask (see docs/archive/specs/set-state-in-effect-fix.md,
    // issue #121/#122): run() can call setState synchronously (the cached-result
    // path), which trips react-hooks/set-state-in-effect when called directly
    // from an effect body. This only changes *when* the update is scheduled
    // relative to React's commit/paint cycle, not the dependency array or run()'s
    // own logic.
    queueMicrotask(() => {
      run(false);
    });
  }, [run, skip]);

  const refresh = useCallback(() => {
    if (persist) clearSessionCache();
    run(true);
  }, [persist, run]);

  const needsManualSelection = status === "denied" || status === "timeout" || status === "unsupported";

  return {
    status,
    coords,
    awaitingPermission: status === "awaiting-permission",
    needsManualSelection,
    refresh,
  };
}
