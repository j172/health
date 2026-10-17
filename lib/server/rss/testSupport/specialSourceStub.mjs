// Stand-in for the ~50 per-publisher "special source" scrapers (fetchUdnHealthNews, fetchNpoSources, ...)
// that runRssIngestion() calls after the RSS loop. The real ones each parse their own site's markup, so
// they cannot run against a synthetic world; this one reproduces what they all have in common and what
// costs memory: GET a listing page, parse it with cheerio, and download every card's image (before any
// change detection, exactly like fetchUdnHealthNews does) into public/images/news/articles.
//
// Registered per import name by ingestStubs.mjs; `name` makes sourceName / URLs unique per source.
import { load } from "cheerio";
import { createHash } from "node:crypto";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export const makeFetcher = (name) => async () => {
  const cfg = globalThis.__rssIngestTest.special;
  const sourceName = `special_${name}`;
  const base = `https://special-${name}.example`;
  const response = await httpGetText(`${base}/list/${name}?n=${cfg.items}`, { timeoutMs: 15_000 });
  const $ = load(response.text);

  const items = [];
  for (const el of $(".card").toArray()) {
    const card = $(el);
    const href = card.find("a").attr("href");
    const title = card.find("a").attr("title");
    const imgSrc = card.find("img").attr("data-src");
    if (!href || !title) continue;
    const canonicalUrl = new URL(href, base).toString();
    const descriptionText = card.find("p").text().trim();
    const assets = [];
    if (imgSrc) {
      const localPath = await downloadArticleImage(new URL(imgSrc, base).toString());
      if (localPath) assets.push({ assetType: "image", title: null, url: localPath, sortOrder: 0 });
    }
    const detailText = cfg.detailChars > 0 ? descriptionText.repeat(Math.ceil(cfg.detailChars / Math.max(1, descriptionText.length))).slice(0, cfg.detailChars) : null;
    items.push({
      sourceName,
      feedCode: name,
      feedName: name,
      externalId: href,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      title,
      descriptionHtml: descriptionText,
      descriptionText,
      detailHtml: detailText ? `<p>${detailText}</p>` : null,
      detailText,
      deptName: null,
      categoryRaw: null,
      displayType: null,
      publishedAtUtc: new Date(Date.now() - items.length * 3_600_000),
      publicBeginAtTaipei: null,
      publicEndAtTaipei: null,
      payloadHash: sha256(`${title}|${canonicalUrl}|${descriptionText}`),
      assets,
      metaTitle: "",
      metaDescription: "",
      keywords: "",
      geoSummary: "",
    });
  }

  return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
};
