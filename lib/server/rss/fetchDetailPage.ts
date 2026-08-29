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

const pickOpenGraphImageUrl = (
  $: ReturnType<typeof load>,
  baseUrl: string,
): string | null => {
  const rawCandidates = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[property="og:image:url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
  ];
  for (const raw of rawCandidates) {
    if (!raw?.trim()) continue;
    const absolute = toAbsoluteUrl(raw.trim(), baseUrl);
    if (!/^https?:\/\//i.test(absolute)) continue;
    if (
      /logo|favicon|icon|sprite|placeholder|\/aa\.(png|gif)|\/x\.png/i.test(
        absolute,
      )
    )
      continue;
    return absolute;
  }
  return null;
};

export const fetchDetailPage = async (
  item: NormalizedRssItem,
): Promise<{
  detailHtml: string | null;
  detailText: string | null;
  assets: NewsAsset[];
}> => {
  const response = await httpGetText(item.canonicalUrl, {
    headers: {
      "User-Agent": "health.j172.tw-rss-ingestor/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeoutMs: 15_000,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Detail page HTTP ${response.status} for ${item.canonicalUrl}`,
    );
  }

  const html = response.text;
  const $ = load(html);

  // Capture social card image before stripping <head>/<meta> (ltn etc. often
  // lack a clean article image container but always ship a reliable og:image).
  const ogImageUrl = pickOpenGraphImageUrl($, item.canonicalUrl);
  const ogImageAlt =
    $('meta[property="og:image:alt"]').attr("content")?.trim() || null;

  $("script,style,noscript,iframe").remove();
  // Removed before container selection so a body-level fallback (sites with no
  // <article>/<main>/#maincontent, e.g. cdc.gov.tw) doesn't pull in site-chrome
  // images like the header logo as if they were part of the article.
  $("header,nav,footer").remove();
  // Some sources (e.g. ltn.com.tw) have a stray <base>/<title> literally inside
  // <body>. Rendered later via dangerouslySetInnerHTML, the browser hoists
  // <title> into our page's real <head> (clobbering our own title) and a
  // <base> tag silently rewrites every relative URL on the whole page.
  $("title,base,head,meta").remove();

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

  // cheerio's .text() concatenates EVERY descendant text node, including markup
  // whose text is metadata rather than prose. CWA 特報 bulletins embed an inline
  // SVG map of Taiwan in which each township is a <path> carrying a <desc> with
  // its name, so detail_text ended up containing all 368 township names — which
  // made the landmark extractor badge a 臺南/屏東 rainfall warning 台北市中正區
  // (issue #65). <script>/<style> are already gone document-wide above, but they
  // are listed here too so this stays correct if that earlier strip ever moves.
  //
  // Done on a CLONE: detailHtml is captured above from the live container, and
  // the asset scan below still walks scopedContainer, so the rendered article
  // keeps its map and its images. Only the text projection loses the metadata.
  const proseContainer = detailContainer.clone();
  proseContainer.find("desc,title,script,style").remove();
  const detailText = proseContainer.text().replace(/\s+/g, " ").trim() || null;

  const assets: NewsAsset[] = [];
  let idx = 0;

  if (ogImageUrl) {
    const localPath = await downloadArticleImage(ogImageUrl);
    if (localPath) {
      idx += 1;
      assets.push({
        assetType: "image",
        title: ogImageAlt,
        url: localPath,
        sortOrder: 0,
      });
    }
  }

  detailContainer.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const absolute = toAbsoluteUrl(href, item.canonicalUrl);
    if (!/\/dl-|\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar)$/i.test(absolute))
      return;
    idx += 1;
    assets.push({
      assetType: "attachment",
      title: $(el).text().trim() || null,
      url: absolute,
      sortOrder: idx,
    });
  });

  // Only trust in-body <img> tags when we found a genuine content container. A
  // raw <body> fallback has no reliable way to distinguish article photos from
  // chrome icons — og:image above already covers the card thumbnail case.
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
