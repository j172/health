/**
 * 全域 TDX 斷路器（行程內，所有 TDX 呼叫端共用）。
 *
 * 為什麼需要：2026-10-15 起 token 請求持續被拒（正式站日誌：HTTP 400、
 * error=unauthorized_client、Invalid client credentials——client 存在但憑證被拒，不是限流），
 * 同一時期公車日同步每個縣市都回 429，TDX 也寄來點數用量超過 100% 的通知。限流器只管「每分鐘
 * 5 次」，管不到「整組憑證被拒」或「點數用完」——每個 cron tick 仍然照打 token 與 API，繼續耗點、
 * 又白占共用限流器的時段。斷路器的工作是：一旦確認是被拒絕（而不是一般的每分鐘節流），就整個行程
 * 暫停打 TDX，讓所有呼叫端走各自本來就有的降級路徑（getTdxToken() 回 null），並且用越來越長的
 * 間隔再去探測。這裡不判斷「為什麼」被拒（憑證失效與配額用盡都一樣處理），原因由
 * tokenDiagnostics.ts 的日誌與 snapshot().reason 呈現。
 *
 *   closed ──失敗──▶ open(15 分) ──到期、放一次探測──▶ half_open
 *      ▲                                                  │ 探測失敗 → open(30 分 → 60 分，上限 60 分)
 *      └──────────────── 探測成功（重置退避）─────────────┘
 *
 * 「失敗」只有四種（TdxTripReason）：token 請求拿到非 200 的 HTTP 回應、API 用盡重試後仍是 429、
 * 429 的 ratelimit-reset 大到不可能是每分鐘節流（= 配額視窗）、API 回 403。沒有 HTTP 回應的錯誤
 * （逾時、連線被重設）與 401／5xx 都不算被拒絕，不會開啟斷路器（只會讓探測重來），否則一次網路
 * 抖動就會讓每日 03:15–03:30 的同步整批停擺。
 *
 * 這個模組刻意沒有任何 import（不碰 secrets、不碰網路），時間與日誌都可注入，方便單元測試。
 * 狀態只存在行程記憶體：行程重啟 = 斷路器回到 closed，第一個請求會立刻重新判斷一次。
 */

export type TdxBreakerState = "closed" | "open" | "half_open";

/** What `acquire()` decided about one outgoing TDX request. */
export type TdxGate =
  /** Breaker closed: send it. */
  | "allowed"
  /** Backoff elapsed: this request is THE single half-open probe — report its outcome. */
  | "probe"
  /** Breaker open (or a probe is already in flight): do not send anything. */
  | "blocked";

export type TdxTripReason =
  | "token_rejected"
  | "quota_exceeded"
  | "rate_limited"
  | "forbidden";

export interface TdxBreakerSnapshot {
  state: TdxBreakerState;
  /** Length of the current (or most recent) backoff; null while closed. */
  backoffMs: number | null;
  /** Epoch ms the breaker stays open until; null while closed. */
  openUntilMs: number | null;
  reason: TdxTripReason | null;
  /** How many times it has opened since process start (monitoring only). */
  trips: number;
}

/** 15 → 30 → 60 minutes, the last value is the ceiling. */
export const TDX_BREAKER_BACKOFF_MS: readonly number[] = [15 * 60_000, 30 * 60_000, 60 * 60_000];

/**
 * A probe that never reports back (its caller crashed between getting the token and calling the API)
 * must not wedge the breaker half-open forever: after this long another request may probe.
 * Longer than the worst case of one probe call: 4 attempts x 12 s timeout plus 3 x 65 s of 429 waits.
 */
export const TDX_BREAKER_PROBE_LEASE_MS = 5 * 60_000;

export interface TdxCircuitBreaker {
  /**
   * True while an outgoing TDX request would be refused. Does not consume the probe — use it for
   * "may I even bother" checks (e.g. before handing out a cached token).
   */
  isBlocked(): boolean;
  /** Call right before sending one request (token or API). Consumes the half-open probe when it hands it out. */
  acquire(): TdxGate;
  /** The request got an answer that proves TDX accepts us (any 2xx–4xx other than 401/403/429). Closes a half-open breaker. */
  recordSuccess(gate: TdxGate): void;
  /** The request was refused. Opens a closed breaker; a failed probe escalates the backoff. */
  recordFailure(reason: TdxTripReason, gate: TdxGate): void;
  /** The request ended without a verdict (timeout, 401, 5xx): hand the probe back so the next request can try. */
  releaseProbe(gate: TdxGate): void;
  /**
   * Settles the OAuth token request that `acquire()` gated. `httpStatus` is null when no HTTP response
   * arrived at all (timeout, connection reset). A token alone never closes the breaker — only a real
   * API answer does — so a good token just hands the probe back for the API call that follows.
   */
  settleTokenRequest(gate: TdxGate, outcome: { ok: boolean; httpStatus: number | null }): void;
  snapshot(): TdxBreakerSnapshot;
  /** Back to closed with the backoff forgotten (tests; also a manual override if an operator ever needs one). */
  reset(): void;
}

export interface TdxCircuitBreakerDeps {
  now?: () => number;
  backoffMs?: readonly number[];
  probeLeaseMs?: number;
  /** Defaults to console.warn. Messages carry state and timings only — never credentials. */
  warn?: (message: string) => void;
}

const minutes = (ms: number): string => `${Math.round(ms / 60_000)} min`;

export function createTdxCircuitBreaker(deps: TdxCircuitBreakerDeps = {}): TdxCircuitBreaker {
  const now = deps.now ?? (() => Date.now());
  const backoffMs = deps.backoffMs ?? TDX_BREAKER_BACKOFF_MS;
  const probeLeaseMs = deps.probeLeaseMs ?? TDX_BREAKER_PROBE_LEASE_MS;
  const warn = deps.warn ?? ((message: string) => console.warn(message));

  if (backoffMs.length === 0) throw new Error("TDX circuit breaker needs at least one backoff step");

  let state: TdxBreakerState = "closed";
  let level = 0; // index into backoffMs of the current / most recent trip
  let openUntilMs = 0;
  let probeStartedAtMs: number | null = null;
  let reason: TdxTripReason | null = null;
  let trips = 0;

  const probeInFlight = (t: number): boolean =>
    probeStartedAtMs !== null && t - probeStartedAtMs < probeLeaseMs;

  const open = (t: number, why: TdxTripReason, nextLevel: number): void => {
    level = nextLevel;
    reason = why;
    state = "open";
    openUntilMs = t + backoffMs[level];
    probeStartedAtMs = null;
    trips += 1;
    warn(
      `[tdx-breaker] OPEN for ${minutes(backoffMs[level])} (reason: ${why}, trip #${trips}); ` +
        `TDX requests are suspended until ${new Date(openUntilMs).toISOString()} and callers fall back to their degraded path`,
    );
  };

  const close = (): void => {
    warn(`[tdx-breaker] CLOSED: the probe request was accepted, TDX requests resume (backoff reset)`);
    state = "closed";
    level = 0;
    openUntilMs = 0;
    probeStartedAtMs = null;
    reason = null;
  };

  const recordFailure = (why: TdxTripReason, gate: TdxGate): void => {
    const t = now();
    if (state === "closed") {
      open(t, why, 0);
      return;
    }
    // Already open: late failures of requests sent before it opened carry no new information.
    // Half-open: only the probe's own verdict escalates the backoff.
    if (state === "half_open" && gate === "probe") {
      open(t, why, Math.min(level + 1, backoffMs.length - 1));
    }
  };

  const releaseProbe = (gate: TdxGate): void => {
    if (state === "half_open" && gate === "probe") probeStartedAtMs = null;
  };

  return {
    isBlocked() {
      const t = now();
      if (state === "closed") return false;
      if (state === "open") return t < openUntilMs;
      return probeInFlight(t);
    },

    acquire() {
      const t = now();
      if (state === "closed") return "allowed";
      if (state === "open") {
        if (t < openUntilMs) return "blocked";
        state = "half_open";
        probeStartedAtMs = t;
        warn(`[tdx-breaker] HALF-OPEN: backoff elapsed, sending a single probe request`);
        return "probe";
      }
      if (probeInFlight(t)) return "blocked";
      probeStartedAtMs = t;
      return "probe";
    },

    recordSuccess(gate) {
      if (state === "half_open" && gate === "probe") close();
    },

    recordFailure,
    releaseProbe,

    settleTokenRequest(gate, outcome) {
      if (outcome.ok || outcome.httpStatus === null) {
        releaseProbe(gate);
        return;
      }
      recordFailure(outcome.httpStatus === 429 ? "rate_limited" : "token_rejected", gate);
    },

    snapshot() {
      return {
        state,
        backoffMs: state === "closed" ? null : backoffMs[level],
        openUntilMs: state === "closed" ? null : openUntilMs,
        reason,
        trips,
      };
    },

    reset() {
      state = "closed";
      level = 0;
      openUntilMs = 0;
      probeStartedAtMs = null;
      reason = null;
    },
  };
}

/** The singleton every TDX caller in this repo shares (one process = one credential = one breaker). */
export const tdxCircuitBreaker: TdxCircuitBreaker = createTdxCircuitBreaker();

/** One short, secret-free sentence for a sync summary / log line explaining why TDX was skipped. */
export function describeTdxBreaker(snapshot: TdxBreakerSnapshot = tdxCircuitBreaker.snapshot()): string {
  if (snapshot.state === "closed") return "circuit breaker closed";
  const until = snapshot.openUntilMs === null ? "unknown" : new Date(snapshot.openUntilMs).toISOString();
  return `circuit breaker ${snapshot.state} (reason: ${snapshot.reason ?? "unknown"}, until ${until})`;
}
