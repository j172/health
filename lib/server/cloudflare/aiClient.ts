import "server-only";
import { env } from "@/lib/server/config/env";
import { httpRequest } from "@/lib/server/net/httpClient";

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

interface WorkersAiChatResponse {
  success: boolean;
  result?: {
    response?: string;
    choices?: { message?: { content?: string } }[];
  };
  errors?: { message: string }[];
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
    throw new Error(`Cloudflare AI request failed with HTTP ${response.status}: ${response.buffer.toString("utf-8").slice(0, 300)}`);
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

/** Runs a single chat completion against Cloudflare Workers AI, using our own
 * node:http(s) client rather than fetch() (see lib/server/net/httpClient.ts
 * for why fetch() itself is unusable on this host).
 *
 * Workers AI intermittently returns success:true with an empty completion
 * under sustained sequential load (observed during bulk RSS ingestion, not
 * reproducible with isolated calls) — retry a couple of times before giving
 * up, since a fresh attempt against the same model reliably succeeds. */
export const runCloudflareAiChat = async (prompt: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> => {
  const { accountId, apiToken } = env.cloudflare;
  if (!accountId || !apiToken) {
    throw new CloudflareAiNotConfiguredError();
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await runOnce(accountId, apiToken, prompt, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Cloudflare AI request failed.");
};
