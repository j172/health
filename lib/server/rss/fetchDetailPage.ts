import { load } from "cheerio";
import type { NewsAsset, NormalizedRssItem } from "@/types/rss";

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
  const response = await fetch(item.canonicalUrl, {
    method: "GET",
    headers: {
      "User-Agent": "health.j172.tw-rss-ingestor/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Detail page HTTP ${response.status} for ${item.canonicalUrl}`);
  }

  const html = await response.text();
  const $ = load(html);

  $("script,style,noscript,iframe").remove();

  const detailContainer =
    $("article").first().length > 0
      ? $("article").first()
      : $("main").first().length > 0
        ? $("main").first()
        : $("#maincontent").first().length > 0
          ? $("#maincontent").first()
          : $("body");

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

  detailContainer.find("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    idx += 1;
    assets.push({
      assetType: "image",
      title: $(el).attr("alt")?.trim() || null,
      url: toAbsoluteUrl(src, item.canonicalUrl),
      sortOrder: idx,
    });
  });

  return {
    detailHtml,
    detailText,
    assets: uniqueAssets(assets),
  };
};