import type { FeedConfig } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchFeedXml = async (feed: FeedConfig): Promise<{ status: number; xml: string }> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await httpGetText(feed.url, {
        headers: {
          "User-Agent": "health.j172.tw-rss-ingestor/1.0",
          Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        timeoutMs: 10_000,
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Feed ${feed.code} HTTP ${response.status}`);
      }

      return { status: response.status, xml: response.text };
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await wait(400 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown feed fetch error");
};