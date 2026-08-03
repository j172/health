import type { FeedConfig } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { withRetry } from "@/lib/server/net/withRetry";

export const fetchFeedXml = async (feed: FeedConfig): Promise<{ status: number; xml: string }> =>
  withRetry(
    async () => {
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
    },
    { maxAttempts: 3, delayMs: 400, nonErrorMessage: "Unknown feed fetch error" },
  );