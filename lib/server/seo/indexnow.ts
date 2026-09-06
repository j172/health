import { getBaseUrl } from "@/lib/server/news/seo";
import { listLatestNews } from "@/lib/server/news/queries";
import { TOOL_CATALOG, isToolIndexable } from "@/lib/server/tools/catalog";

export const DEFAULT_INDEXNOW_KEY = "c0e7b8782f9c464c8d5c414995f7c32e";

export const getIndexNowKey = (): string => {
  return process.env.INDEXNOW_KEY?.trim() || DEFAULT_INDEXNOW_KEY;
};

export const getIndexNowKeyLocation = (baseUrl?: string): string => {
  const base = baseUrl || getBaseUrl();
  const key = getIndexNowKey();
  return `${base}/${key}.txt`;
};

export interface IndexNowSubmitResult {
  ok: boolean;
  status: number;
  submittedCount: number;
  message?: string;
  error?: string;
}

/**
 * Submits an array of URLs to the IndexNow endpoint (https://api.indexnow.org/indexnow).
 * IndexNow distributes the notification to participating search engines
 * including Microsoft Bing, Yandex, Seznam, and Naver.
 */
export async function submitToIndexNow(
  urls: string[],
): Promise<IndexNowSubmitResult> {
  const key = getIndexNowKey();
  const baseUrl = getBaseUrl();
  const parsedBase = new URL(baseUrl);
  const host = parsedBase.host;
  const keyLocation = getIndexNowKeyLocation(baseUrl);

  // Normalize, deduplicate, and verify URLs belong to this host
  const uniqueUrls = Array.from(
    new Set(
      urls
        .map((u) => u?.trim())
        .filter((u): u is string => Boolean(u && u.startsWith("http"))),
    ),
  ).filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });

  if (uniqueUrls.length === 0) {
    return {
      ok: true,
      status: 200,
      submittedCount: 0,
      message: "No valid URLs matching current host to submit.",
    };
  }

  // IndexNow supports up to 10,000 URLs per HTTP POST request
  const BATCH_SIZE = 10_000;
  let lastStatus = 200;
  let totalSubmitted = 0;

  for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
    const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
    const payload = {
      host,
      key,
      keyLocation,
      urlList: batch,
    };

    try {
      const response = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(payload),
      });

      lastStatus = response.status;
      // IndexNow returns 200 OK or 202 Accepted (key validation pending)
      if (!response.ok && response.status !== 202) {
        const text = await response.text().catch(() => "");
        const errorMsg = `IndexNow HTTP ${response.status}: ${text || response.statusText}`;
        console.warn(`[IndexNow] Submission warning: ${errorMsg}`);
        return {
          ok: false,
          status: response.status,
          submittedCount: totalSubmitted,
          error: errorMsg,
        };
      }

      totalSubmitted += batch.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[IndexNow] Network error:`, msg);
      return {
        ok: false,
        status: 500,
        submittedCount: totalSubmitted,
        error: msg,
      };
    }
  }

  return {
    ok: true,
    status: lastStatus,
    submittedCount: totalSubmitted,
    message: `Successfully submitted ${totalSubmitted} URL(s) to IndexNow.`,
  };
}

/**
 * Submits the most recent N news articles to IndexNow.
 */
export async function submitRecentNewsToIndexNow(
  limit = 100,
): Promise<IndexNowSubmitResult> {
  const baseUrl = getBaseUrl();
  const items = await listLatestNews(limit);
  const urls = items.map((item) => `${baseUrl}/news/${item.id}`);
  return submitToIndexNow(urls);
}

/**
 * Submits core site pages (home, news, tools, public tools) to IndexNow.
 */
export async function submitCorePagesToIndexNow(): Promise<IndexNowSubmitResult> {
  const baseUrl = getBaseUrl();
  const toolUrls = TOOL_CATALOG.filter(isToolIndexable).map(
    (tool) => `${baseUrl}/tools/${tool.slug}`,
  );

  const urls = [
    baseUrl,
    `${baseUrl}/news`,
    `${baseUrl}/tools`,
    `${baseUrl}/privacy`,
    ...toolUrls,
  ];

  return submitToIndexNow(urls);
}
