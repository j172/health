import "server-only";
import { env } from "@/lib/server/config/env";
import { httpRequest } from "@/lib/server/net/httpClient";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const DEFAULT_TIMEOUT_MS = 20_000;

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

/** Runs a single chat completion against Cloudflare Workers AI, using our own
 * node:http(s) client rather than fetch() (see lib/server/net/httpClient.ts
 * for why fetch() itself is unusable on this host). */
export const runCloudflareAiChat = async (prompt: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> => {
  const { accountId, apiToken } = env.cloudflare;
  if (!accountId || !apiToken) {
    throw new CloudflareAiNotConfiguredError();
  }

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
