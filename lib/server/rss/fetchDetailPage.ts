import { load } from "cheerio";
import type { NewsAsset, NormalizedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";

const toAbsoluteUrl = (url: string, base: string): string => {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
};

const uniqueAssets = (assets: NewsAsset[]): NewsAsset[] => {
  const seen = new Set<string>();
  const result: NewsAsset[] = [];

  for (const asset of assets) {
    const key = `${asset.assetType}:${asset.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(asset);
  }

  return result;
};

export const fetchDetailPage = async (item: NormalizedRssItem): Promise<{ detailHtml: string | null; detailText: string | null; assets: NewsAsset[] }> => {
  const response = await httpGetText(item.canonicalUrl, {
    headers: {
      "User-Agent": "health.j172.tw-rss-ingestor/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeoutMs: 15_000,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Detail page HTTP ${response.status} for ${item.canonicalUrl}`);
  }

  const html = response.text;
  const $ = load(html);

  $("script,style,noscript,iframe").remove();
  // Removed before container selection so a body-level fallback (sites with no
  // <article>/<main>/#maincontent, e.g. cdc.gov.tw) doesn't pull in site-chrome
  // images like the header logo as if they were part of the article.
  $("header,nav,footer").remove();

  const scopedContainer =
    $("article").first().length > 0
      ? $("article").first()
      : $("main").first().length > 0
        ? $("main").first()
        : $("#maincontent").first().length > 0
          ? $("#maincontent").first()
          : null;
  const detailContainer = scopedContainer ?? $("body");

  const detailHtml = detailContainer.html()?.trim() || null;
  const detailText = detailContainer.text().replace(/\s+/g, " ").trim() || null;

  const assets: NewsAsset[] = [];
  let idx = 0;

  detailContainer.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const absolute = toAbsoluteUrl(href, item.canonicalUrl);
    if (!/\/dl-|\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar)$/i.test(absolute)) return;
    idx += 1;
    assets.push({
      assetType: "attachment",
      title: $(el).text().trim() || null,
      url: absolute,
      sortOrder: idx,
    });
  });

  // Only trust <img> tags when we found a genuine content container. A raw
  // <body> fallback (sites with no <article>/<main>/#maincontent, e.g.
  // cdc.gov.tw, fda.gov.tw, hpa.gov.tw, ltn.com.tw) has no reliable way to
  // distinguish an article photo from breadcrumb/toolbar/portal-badge icons,
  // so skip image extraction entirely there and let the Pixabay fallback
  // assign a card image instead.
  if (scopedContainer) {
    const imageElements = scopedContainer.find("img[src]").toArray();
    for (const el of imageElements) {
      const src = $(el).attr("src");
      if (!src) continue;
      if (/logo|favicon|icon/i.test(src)) continue;

      const absolute = toAbsoluteUrl(src, item.canonicalUrl);
      // Downloaded and re-hosted locally rather than storing the source
      // site's URL directly, so the front-end never hotlinks a third-party
      // domain (which can rate-limit, go offline, or move the file).
      // eslint-disable-next-line no-await-in-loop
      const localPath = await downloadArticleImage(absolute);
      if (!localPath) continue;

      idx += 1;
      assets.push({
        assetType: "image",
        title: $(el).attr("alt")?.trim() || null,
        url: localPath,
        sortOrder: idx,
      });
    }
  }

  return {
    detailHtml,
    detailText,
    assets: uniqueAssets(assets),
  };
};