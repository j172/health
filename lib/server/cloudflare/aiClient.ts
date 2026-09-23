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

/** UTC calendar day (Cloudflare's neuron quota resets at UTC midnight) on which
 * a CloudflareAiQuotaExceededError was last observed, or null if not currently
 * known-exhausted. A single ingestion run can call this for thousands of items
 * in a tight loop; without this latch, every item after the quota dies still
 * pays for a full HTTPS request — including, per lib/server/net/httpClient.ts,
 * rebuilding an OpenSSL SecureContext from a ~170-entry custom CA list on every
 * call, since that client sets no keep-alive/agent reuse. Hundreds of those in
 * a row is what produced a native `std::bad_alloc` inside `SSL_CTX_add_client_CA`
 * and crashed the whole process (2026-09-23 incident) — this avoids the retries
 * entirely once we already know they're pointless. */
let quotaExceededOnUtcDay: string | null = null;

const currentUtcDay = (): string => new Date().toISOString().slice(0, 10);

/** Runs a single chat completion against Cloudflare Workers AI, using our own
 * node:http(s) client rather than fetch() (see lib/server/net/httpClient.ts
 * for why fetch() itself is unusable on this host).
 *
 * Workers AI intermittently returns success:true with an empty completion
 * under sustained sequential load, most often while the account is close to
 * (but not yet over) its daily neuron quota — retry a couple of times before
 * giving up, since a fresh attempt against the same model often succeeds.
 * Once the quota is actually exhausted (CloudflareAiQuotaExceededError),
 * every subsequent call fails identically, so we don't retry those, and we
 * remember it for the rest of the UTC day so later calls (possibly thousands,
 * within the same ingestion run) skip the network entirely. */
export const runCloudflareAiChat = async (prompt: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> => {
  const { accountId, apiToken } = env.cloudflare;
  if (!accountId || !apiToken) {
    throw new CloudflareAiNotConfiguredError();
  }

  if (quotaExceededOnUtcDay === currentUtcDay()) {
    throw new CloudflareAiQuotaExceededError(
      "Cloudflare AI daily neuron quota exceeded (remembered from an earlier call today — skipping network request).",
    );
  }

  try {
    return await withRetry(() => runOnce(accountId, apiToken, prompt, timeoutMs), {
      maxAttempts: MAX_ATTEMPTS,
      delayMs: RETRY_DELAY_MS,
      isRetryable: (error) => !(error instanceof CloudflareAiQuotaExceededError),
      nonErrorMessage: "Cloudflare AI request failed.",
    });
  } catch (error) {
    if (error instanceof CloudflareAiQuotaExceededError) {
      quotaExceededOnUtcDay = currentUtcDay();
    }
    throw error;
  }
};
