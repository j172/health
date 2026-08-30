import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// Hello 醫師 (helloyishi.com.tw) — evidence-based medical and health articles
// reviewed by physicians and medical specialists.
// Summary + thumbnail only (skipDetailFetch policy for commercial media).
// ---------------------------------------------------------------------------

const FEED_CODE = "helloyishi_news" as const;
const SOURCE_NAME = "helloyishi";
const FEED_NAME = "Hello 醫師";
const BASE_URL = "https://helloyishi.com.tw";

export interface HelloYishiFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchHelloYishiNews = async (): Promise<HelloYishiFetchResult> => {
  try {
    const response = await httpGetText(BASE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeoutMs: 15_000,
    });

    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false,
        httpStatus: response.status,
        itemCount: 0,
        items: [],
        errorMessage: `Hello 醫師 HTTP ${response.status}`,
      };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seenUrls = new Set<string>();

    const articleAnchors = $(
      "a[href*='/health/'], a[href*='/healthy-living/'], a[href*='/parenting/'], a[href*='/medical-tests/'], a[href*='/drugs/']",
    ).toArray();

    for (const el of articleAnchors) {
      const anchor = $(el);
      let href = anchor.attr("href");
      if (!href) continue;

      if (!href.startsWith("http")) {
        href = `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
      }

      // Ignore top-level category index pages
      if (
        href === `${BASE_URL}/` ||
        href === `${BASE_URL}/health/` ||
        href === `${BASE_URL}/healthy-living/` ||
        href === `${BASE_URL}/parenting/`
      ) {
        continue;
      }

      if (seenUrls.has(href)) continue;

      const title =
        anchor.find("h2, h3, p, span").first().text().trim() ||
        anchor.text().trim();

      if (!title || title.length < 5) continue;
      seenUrls.add(href);

      const externalId = href.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "");
      const imgSrc =
        anchor.find("img").attr("src") ||
        anchor.find("img").attr("data-src") ||
        null;

      const assets: EnrichedRssItem["assets"] = [];
      if (imgSrc && imgSrc.startsWith("http")) {
        const localPath = await downloadArticleImage(imgSrc);
        if (localPath) {
          assets.push({
            assetType: "image",
            title: null,
            url: localPath,
            sortOrder: 0,
          });
        }
      }

      const payloadHash = sha256(
        JSON.stringify({
          title,
          canonicalUrl: href,
          imgSrc,
        }),
      );

      items.push({
        sourceName: SOURCE_NAME,
        feedCode: FEED_CODE,
        feedName: FEED_NAME,
        externalId: externalId || sha256(href).slice(0, 16),
        canonicalUrl: href,
        sourceUrl: href,
        title: title.replace(/\s+/g, " "),
        descriptionHtml: "",
        descriptionText: "",
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "健康新知",
        displayType: null,
        publishedAtUtc: null,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    }

    return {
      ok: true,
      httpStatus: response.status,
      itemCount: items.length,
      items,
      errorMessage: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Hello 醫師 fetch error";
    return {
      ok: false,
      httpStatus: null,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};

