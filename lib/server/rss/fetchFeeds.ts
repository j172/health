import type { FeedConfig } from "@/types/rss";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchFeedXml = async (feed: FeedConfig): Promise<{ status: number; xml: string }> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(feed.url, {
        method: "GET",
        headers: {
          "User-Agent": "health.j172.tw-rss-ingestor/1.0",
          Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        cache: "no-store",
        signal: controller.signal,
      });

      const xml = await response.text();
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Feed ${feed.code} HTTP ${response.status}`);
      }

      return { status: response.status, xml };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < 3) {
        await wait(400 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown feed fetch error");
};