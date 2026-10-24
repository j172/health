/**
 * TDX MQTTS 串流斷路器與雙軌容錯管理器 (Dual-Engine Failover & Circuit Breaker)
 *
 * 職責：
 * 1. 監控 MQTTS 長連線健康狀態：狀態機 CLOSED (推播模式) ── 15 分鐘斷線 ──▶ OPEN (定時輪詢備援)
 * 2. 在 MQTTS 異常斷線超過 15 分鐘時，自動觸發降級切換至低頻 REST 輪詢 (fallback_polling)。
 * 3. 嚴格守護 TDX 免費會員 3,000 次/月點數配額：降級輪詢設定為每 3 小時一次、每日請求上限 <= 80 次。
 * 4. 支援 HALF_OPEN 探測機制：連線恢復探測成功後無縫切回 CLOSED 零點數推播模式。
 * 5. 全程日誌與診斷脫敏，禁止洩漏任何金鑰或憑證。
 */

import { reconcileRailAlerts, type ReconcileResult } from "./reconciliation.ts";

export type StreamCircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
export type StreamActiveEngine = "push" | "fallback_polling" | "degraded";

export interface StreamCircuitTransition {
  timestamp: string;
  fromState: StreamCircuitState;
  toState: StreamCircuitState;
  reason: string;
}

export interface TdxStreamCircuitStatus {
  state: StreamCircuitState;
  activeEngine: StreamActiveEngine;
  lastStateChange: string;
  lastDisconnectTime: number | null;
  failoverCount: number;
  transitionHistory: StreamCircuitTransition[];
  fallbackRequestsToday: number;
  dailyBudgetRemaining: number;
}

export interface FallbackPollOutcome {
  ran: boolean;
  bypassed?: boolean;
  throttled?: boolean;
  quotaExceeded?: boolean;
  reason?: string;
  requestsConsumed?: number;
  dailyRemaining?: number;
  result?: ReconcileResult;
}

/** 15 minutes disconnect timeout before tripping to fallback polling */
export const DISCONNECT_FAILOVER_THRESHOLD_MS = 15 * 60 * 1000;

/** Minimum interval between fallback polls: 3 hours (8 runs/day) */
export const FALLBACK_POLL_INTERVAL_MS = 3 * 60 * 60 * 1000;

/** Maximum requests allocated for fallback polling per day to safeguard 3,000/month quota */
export const MAX_FALLBACK_REQUESTS_PER_DAY = 80;

/** Default requests consumed per reconciliation round (6 Metro operators) */
export const DEFAULT_REQUESTS_PER_POLL = 6;

const MAX_HISTORY_LENGTH = 50;

export interface StreamCircuitBreakerOptions {
  now?: () => number;
  disconnectThresholdMs?: number;
  minFallbackIntervalMs?: number;
  maxDailyRequests?: number;
  requestsPerPoll?: number;
  warn?: (msg: string) => void;
  reconcileFn?: (deps?: any) => Promise<ReconcileResult>;
}

export interface TdxStreamCircuitBreaker {
  getState(): StreamCircuitState;
  getActiveEngine(): StreamActiveEngine;
  getLastDisconnectTime(): number | null;
  recordConnectionSuccess(): void;
  recordDisconnect(timestamp?: number): void;
  checkAndEvaluateState(nowMs?: number): StreamCircuitState;
  tripToOpen(reason: string): void;
  attemptRecovery(reason?: string): boolean;
  getCircuitStatus(): TdxStreamCircuitStatus;
  executeFallbackPoll(deps?: any): Promise<FallbackPollOutcome>;
  reset(): void;
}

export function createStreamCircuitBreaker(
  options: StreamCircuitBreakerOptions = {},
): TdxStreamCircuitBreaker {
  const now = options.now ?? (() => Date.now());
  const disconnectThresholdMs =
    options.disconnectThresholdMs ?? DISCONNECT_FAILOVER_THRESHOLD_MS;
  const minFallbackIntervalMs =
    options.minFallbackIntervalMs ?? FALLBACK_POLL_INTERVAL_MS;
  const maxDailyRequests =
    options.maxDailyRequests ?? MAX_FALLBACK_REQUESTS_PER_DAY;
  const requestsPerPoll = options.requestsPerPoll ?? DEFAULT_REQUESTS_PER_POLL;
  const warn = options.warn ?? ((msg: string) => console.warn(msg));
  const reconcileFn = options.reconcileFn ?? reconcileRailAlerts;

  let state: StreamCircuitState = "CLOSED";
  let lastDisconnectTime: number | null = null;
  let lastStateChange: string = new Date(now()).toISOString();
  let failoverCount = 0;
  const transitionHistory: StreamCircuitTransition[] = [];

  let fallbackRequestsToday = 0;
  let lastFallbackDate: string = new Date(now()).toISOString().slice(0, 10);
  let lastFallbackPollTime: number | null = null;

  function sanitizeReason(reason: string): string {
    return reason
      .replace(/key=[^&\s]+/gi, "key=[REDACTED]")
      .replace(/password=[^&\s]+/gi, "password=[REDACTED]")
      .replace(/secret=[^&\s]+/gi, "secret=[REDACTED]");
  }

  function checkDayRollover(t: number): void {
    const today = new Date(t).toISOString().slice(0, 10);
    if (today !== lastFallbackDate) {
      fallbackRequestsToday = 0;
      lastFallbackDate = today;
    }
  }

  function recordTransition(
    fromState: StreamCircuitState,
    toState: StreamCircuitState,
    reason: string,
  ): void {
    const timestamp = new Date(now()).toISOString();
    lastStateChange = timestamp;

    const entry: StreamCircuitTransition = {
      timestamp,
      fromState,
      toState,
      reason: sanitizeReason(reason),
    };

    transitionHistory.unshift(entry);
    if (transitionHistory.length > MAX_HISTORY_LENGTH) {
      transitionHistory.pop();
    }

    warn(
      `[TDX-Failover] State transition: ${fromState} -> ${toState} | Reason: ${entry.reason}`,
    );
  }

  function getActiveEngine(): StreamActiveEngine {
    if (state === "CLOSED") return "push";
    if (state === "OPEN") return "fallback_polling";
    return "degraded";
  }

  function tripToOpen(reason: string): void {
    if (state === "OPEN") return;
    const from = state;
    state = "OPEN";
    failoverCount += 1;
    recordTransition(from, "OPEN", reason);
  }

  function attemptRecovery(
    reason: string = "Probing MQTTS broker connection",
  ): boolean {
    if (state === "OPEN") {
      const from = state;
      state = "HALF_OPEN";
      recordTransition(from, "HALF_OPEN", reason);
      return true;
    }
    return false;
  }

  function checkAndEvaluateState(nowMs?: number): StreamCircuitState {
    const t = nowMs ?? now();
    if (state === "CLOSED" && lastDisconnectTime !== null) {
      const elapsed = t - lastDisconnectTime;
      if (elapsed >= disconnectThresholdMs) {
        const mins = Math.round(elapsed / 60_000);
        tripToOpen(
          `MQTTS broker disconnected for ${mins} minutes (threshold: ${Math.round(
            disconnectThresholdMs / 60_000,
          )} min)`,
        );
      }
    }
    return state;
  }

  function recordConnectionSuccess(): void {
    const t = now();
    const from = state;
    lastDisconnectTime = null;

    if (from === "HALF_OPEN") {
      state = "CLOSED";
      recordTransition(from, "CLOSED", "MQTTS connection probed successfully");
    } else if (from === "OPEN") {
      state = "CLOSED";
      recordTransition(from, "CLOSED", "MQTTS connection restored");
    }
  }

  function recordDisconnect(timestamp?: number): void {
    const t = timestamp ?? now();
    if (lastDisconnectTime === null) {
      lastDisconnectTime = t;
    }
    checkAndEvaluateState(t);
  }

  async function executeFallbackPoll(deps: any = {}): Promise<FallbackPollOutcome> {
    const t = deps.now ? deps.now() : now();
    checkDayRollover(t);

    if (state !== "OPEN") {
      return {
        ran: false,
        bypassed: true,
        reason: `circuit_not_open (current: ${state})`,
      };
    }

    // Check throttle interval (minimum interval between fallback polls)
    if (
      lastFallbackPollTime !== null &&
      t - lastFallbackPollTime < minFallbackIntervalMs
    ) {
      return {
        ran: false,
        throttled: true,
        reason: `min_interval_not_elapsed (${Math.round(
          (minFallbackIntervalMs - (t - lastFallbackPollTime)) / 60000,
        )} min remaining)`,
        dailyRemaining: Math.max(0, maxDailyRequests - fallbackRequestsToday),
      };
    }

    const neededRequests = deps.requestsPerPoll ?? requestsPerPoll;

    // Check safety budget ceiling (80 requests/day)
    if (fallbackRequestsToday + neededRequests > maxDailyRequests) {
      return {
        ran: false,
        quotaExceeded: true,
        reason: "daily_fallback_budget_exceeded",
        dailyRemaining: Math.max(0, maxDailyRequests - fallbackRequestsToday),
      };
    }

    // Execute reconciliation
    try {
      const result = await reconcileFn(deps);
      fallbackRequestsToday += neededRequests;
      lastFallbackPollTime = t;

      return {
        ran: true,
        requestsConsumed: neededRequests,
        dailyRemaining: Math.max(0, maxDailyRequests - fallbackRequestsToday),
        result,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fallbackRequestsToday += neededRequests;
      lastFallbackPollTime = t;

      return {
        ran: false,
        reason: `reconciliation_failed: ${sanitizeReason(msg)}`,
        requestsConsumed: neededRequests,
        dailyRemaining: Math.max(0, maxDailyRequests - fallbackRequestsToday),
      };
    }
  }

  function getCircuitStatus(): TdxStreamCircuitStatus {
    const t = now();
    checkDayRollover(t);

    return {
      state,
      activeEngine: getActiveEngine(),
      lastStateChange,
      lastDisconnectTime,
      failoverCount,
      transitionHistory: [...transitionHistory],
      fallbackRequestsToday,
      dailyBudgetRemaining: Math.max(0, maxDailyRequests - fallbackRequestsToday),
    };
  }

  function reset(): void {
    state = "CLOSED";
    lastDisconnectTime = null;
    lastStateChange = new Date(now()).toISOString();
    failoverCount = 0;
    transitionHistory.length = 0;
    fallbackRequestsToday = 0;
    lastFallbackPollTime = null;
  }

  return {
    getState: () => state,
    getActiveEngine,
    getLastDisconnectTime: () => lastDisconnectTime,
    recordConnectionSuccess,
    recordDisconnect,
    checkAndEvaluateState,
    tripToOpen,
    attemptRecovery,
    getCircuitStatus,
    executeFallbackPoll,
    reset,
  };
}

/** Production singleton instance for TDX MQTTS failover circuit breaker */
export const tdxStreamCircuitBreaker: TdxStreamCircuitBreaker =
  createStreamCircuitBreaker();
