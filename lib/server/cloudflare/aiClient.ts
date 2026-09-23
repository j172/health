import "server-only";
import { env } from "@/lib/server/config/env";
import { httpRequest } from "@/lib/server/net/httpClient";
import { withRetry } from "@/lib/server/net/withRetry";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 750;

export class CloudflareAiNotConfiguredError extends Error {
  constructor() {
    super("CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN is not configured.");
    this.name = "CloudflareAiNotConfiguredError";
  }
}

/** Cloudflare's Workers AI free-tier daily neuron allocation (error code
 * 4006) has been exhausted — every call will fail identically until the
 * quota resets, so retrying is pointless and just triples ingestion time. */
export class CloudflareAiQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudflareAiQuotaExceededError";
  }
}

interface WorkersAiChatResponse {
  success: boolean;
  result?: {
    response?: string;
    choices?: { message?: { content?: string } }[];
  };
  errors?: { message: string }[];
}

const runOnce = async (accountId: string, apiToken: string, prompt: string, timeoutMs: number): Promise<string> => {
  const response = await httpRequest(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`, {
    method: "POST",
    timeoutMs,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: 512 }),
  });

  if (response.status < 200 || response.status >= 300) {
    const bodyText = response.buffer.toString("utf-8").slice(0, 300);
    if (response.status === 429 && /daily free allocation/i.test(bodyText)) {
      throw new CloudflareAiQuotaExceededError(`Cloudflare AI daily neuron quota exceeded: ${bodyText}`);
    }
    throw new Error(`Cloudflare AI request failed with HTTP ${response.status}: ${bodyText}`);
  }

  const json = JSON.parse(response.buffer.toString("utf-8")) as WorkersAiChatResponse;
  if (!json.success) {
    throw new Error(`Cloudflare AI error: ${json.errors?.[0]?.message ?? "unknown"}`);
  }

  const content = json.result?.response ?? json.result?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Cloudflare AI returned an empty response.");
  }

  return content.trim();
};

/** Thrown once the general circuit breaker (below) has opened: some non-quota
 * failure (auth, network, malformed response, ...) has repeated enough times
 * in a row that further identical attempts are assumed pointless for the rest
 * of the day. */
export class CloudflareAiCircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudflareAiCircuitOpenError";
  }
}

/** UTC calendar day on which a CloudflareAiQuotaExceededError was last
 * observed, or null if not currently known-exhausted (quota resets at UTC
 * midnight). A single ingestion run can call this for thousands of items in
 * a tight loop; without this latch, every item after the quota dies still
 * pays for a full HTTPS request — including, per lib/server/net/httpClient.ts,
 * rebuilding an OpenSSL SecureContext from a ~170-entry custom CA list on every
 * call, since that client sets no keep-alive/agent reuse. Hundreds of those in
 * a row is what produced a native `std::bad_alloc` inside `SSL_CTX_add_client_CA`
 * and crashed the whole process (2026-09-23 incident). */
let quotaExceededOnUtcDay: string | null = null;

/** Same idea, but for any OTHER sustained failure — confirmed necessary the
 * same night: the account's API token started returning a flat HTTP 401
 * "Authentication error" (likely missing the Workers AI permission scope
 * after a token rotation — a Cloudflare-dashboard fix, not a code one), which
 * doesn't throw CloudflareAiQuotaExceededError, so the quota latch alone let
 * ~1400 consecutive doomed calls back-to-back reproduce the exact same
 * std::bad_alloc crash by a different door. Trips after CIRCUIT_FAILURE_THRESHOLD
 * consecutive non-quota failures (each of those calls already internally
 * retries MAX_ATTEMPTS times via withRetry, so this bounds total doomed
 * network attempts to a small constant instead of thousands). */
let circuitOpenOnUtcDay: string | null = null;
let consecutiveNonQuotaFailures = 0;
const CIRCUIT_FAILURE_THRESHOLD = 3;

const currentUtcDay = (): string => new Date().toISOString().slice(0, 10);

/** Runs a single chat completion against Cloudflare Workers AI, using our own
 * node:http(s) client rather than fetch() (see lib/server/net/httpClient.ts
 * for why fetch() itself is unusable on this host).
 *
 * Workers AI intermittently returns success:true with an empty completion
 * under sustained sequential load, most often while the account is close to
 * (but not yet over) its daily neuron quota — retry a couple of times before
 * giving up, since a fresh attempt against the same model often succeeds.
 * Once the quota is actually exhausted (CloudflareAiQuotaExceededError), or
 * once any other failure mode has repeated CIRCUIT_FAILURE_THRESHOLD times in
 * a row, every subsequent call is assumed to fail identically, so we stop
 * retrying and remember it for the rest of the UTC day — later calls
 * (possibly thousands, within the same ingestion run) skip the network
 * entirely instead of each paying for a doomed HTTPS request. */
export const runCloudflareAiChat = async (prompt: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> => {
  const { accountId, apiToken } = env.cloudflare;
  if (!accountId || !apiToken) {
    throw new CloudflareAiNotConfiguredError();
  }

  const today = currentUtcDay();
  if (quotaExceededOnUtcDay === today) {
    throw new CloudflareAiQuotaExceededError(
      "Cloudflare AI daily neuron quota exceeded (remembered from an earlier call today — skipping network request).",
    );
  }
  if (circuitOpenOnUtcDay === today) {
    throw new CloudflareAiCircuitOpenError(
      `Cloudflare AI has failed ${CIRCUIT_FAILURE_THRESHOLD}+ times in a row today (remembered from earlier calls today — skipping network request).`,
    );
  }

  try {
    const result = await withRetry(() => runOnce(accountId, apiToken, prompt, timeoutMs), {
      maxAttempts: MAX_ATTEMPTS,
      delayMs: RETRY_DELAY_MS,
      isRetryable: (error) => !(error instanceof CloudflareAiQuotaExceededError),
      nonErrorMessage: "Cloudflare AI request failed.",
    });
    consecutiveNonQuotaFailures = 0;
    return result;
  } catch (error) {
    if (error instanceof CloudflareAiQuotaExceededError) {
      quotaExceededOnUtcDay = today;
    } else {
      consecutiveNonQuotaFailures += 1;
      if (consecutiveNonQuotaFailures >= CIRCUIT_FAILURE_THRESHOLD) {
        circuitOpenOnUtcDay = today;
      }
    }
    throw error;
  }
};
