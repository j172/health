import { httpGetText } from "@/lib/server/net/httpClient";

export interface TdxRetryOptions {
  timeoutMs?: number;
  /** Retries after the first 429; default 4. */
  maxRetries?: number;
  /** First back-off delay in ms, doubled on each further 429; default 1500. */
  baseDelayMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests. */
  getText?: typeof httpGetText;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * GETs a TDX JSON endpoint, backing off and retrying on HTTP 429.
 *
 * TDX rate-limits per client key. The multi-county facility syncs
 * (tdxAudibleSignals.ts, tdxParking.ts) fire several county requests at once;
 * on the first live run (2026-10-14) nearly every county came back 429 —
 * tdx_parking fetched 0 rows and tdx_aps only 125 — because nothing retried.
 *
 * Returns `{ status, data }` like httpGetJson; `data` is only parsed for a
 * 200, so a non-JSON error body never throws here.
 */
export async function tdxGetJsonWithRetry<T>(
  url: string,
  token: string,
  options: TdxRetryOptions = {},
): Promise<{ status: number; data: T | null }> {
  const { timeoutMs = 12000, maxRetries = 4, baseDelayMs = 1500, sleep = defaultSleep, getText = httpGetText } = options;

  for (let attempt = 0; ; attempt++) {
    const res = await getText(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      timeoutMs,
    });
    if (res.status === 429 && attempt < maxRetries) {
      await sleep(baseDelayMs * 2 ** attempt);
      continue;
    }
    return { status: res.status, data: res.status === 200 ? (JSON.parse(res.text) as T) : null };
  }
}
