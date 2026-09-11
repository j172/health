import "server-only";
import { load } from "cheerio";
import type { EnrichedRssItem, FeedCode, NewsAsset } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { sha256, toAbsoluteUrl } from "@/lib/server/rss/scraperUtils";

export interface ExpandedSourceFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/**
 * Universal date parser for Taiwan web pages:
 * Handles Gregorian (2026/09/11, 2026-09-11, 2026.09.11, 2026年9月11日),
 * ROC years (115/09/11, 115-09-11, 115.09.11 -> 2026),
 * and relative time offsets ("3小時前", "10分鐘前", "今天").
 */
export const parseTaiwanDateToUtc = (value: string | null | undefined, referenceNow: Date = new Date()): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Relative time
  if (trimmed === "剛剛" || trimmed === "今天") return referenceNow;
  if (trimmed === "昨天") return new Date(referenceNow.getTime() - 86_400_000);
  const hourMatch = trimmed.match(/^(\d+)\s*小時前$/);
  if (hourMatch) return new Date(referenceNow.getTime() - Number(hourMatch[1]) * 3_600_000);
  const minMatch = trimmed.match(/^(\d+)\s*分鐘前$/);
  if (minMatch) return new Date(referenceNow.getTime() - Number(minMatch[1]) * 60_000);
  const dayMatch = trimmed.match(/^(\d+)\s*天前$/);
  if (dayMatch) return new Date(referenceNow.getTime() - Number(dayMatch[1]) * 86_400_000);

  // Standard dates (Gregorian or ROC)
  const m = trimmed.match(/(\d{2,4})[./\s-年]+(\d{1,2})[./\s-月]+(\d{1,2})/);
  if (m) {
    let year = Number(m[1]);
    if (year < 1900) {
      // Taiwan ROC year (e.g., 115 -> 2026)
      year += 1911;
    }
    const month = Number(m[2]);
    const day = Number(m[3]);
    const utcMillis = Date.UTC(year, month - 1, day, 0, 0, 0);
    const date = new Date(utcMillis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const iso = new Date(trimmed);
  return Number.isNaN(iso.getTime()) ? null : iso;
};

// ---------------------------------------------------------------------------
// 1. 永齡基金會 (Yonglin Foundation)
// ---------------------------------------------------------------------------
export const parseYonglinHtml = (html: string, baseUrl = "https://www.yonglin.org.tw"): EnrichedRssItem[] => {
  const $ = load(html);
  const items: EnrichedRssItem[] = [];
  const seen = new Set<string>();

  const candidates = $("a[href*='/news/detail/'], a[href*='/news/'], .news-item, .card").toArray();
  for (const el of candidates) {
    const $el = $(el);
    const anchor = $el.is("a") ? $el : $el.find("a[href*='/news/']").first();
    const rawHref = anchor.attr("href");
    if (!rawHref || rawHref === "/news/list" || rawHref === "/news" || rawHref === "/news/") continue;

    const canonicalUrl = toAbsoluteUrl(rawHref, baseUrl);
    if (seen.has(canonicalUrl)) continue;

    const title = (
      anchor.find("h2, h3, h4, .title").first().text() ||
      anchor.attr("title") ||
      anchor.text()
    ).trim().replace(/\s+/g, " ");

    if (!title || title.length < 5) continue;
    seen.add(canonicalUrl);

    const dateText = $el.find(".date, time, .time, span").text() || anchor.text();
    const publishedAtUtc = parseTaiwanDateToUtc(dateText);

    const descText = ($el.find("p, .desc, .summary").first().text() || "").trim().replace(/\s+/g, " ");
    const imgSrc = anchor.find("img").attr("src") || $el.find("img").attr("src");
    const assets: NewsAsset[] = [];
    if (imgSrc) {
      assets.push({ assetType: "image", title: null, url: toAbsoluteUrl(imgSrc, baseUrl), sortOrder: 0 });
    }

    const externalId = canonicalUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "") || sha256(canonicalUrl).slice(0, 16);
    const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, publishedAtUtc }));

    items.push({
      sourceName: "yonglin",
      feedCode: "yonglin_news",
      feedName: "永齡基金會",
      externalId,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      title,
      descriptionHtml: descText,
      descriptionText: descText,
      detailHtml: null,
      detailText: null,
      deptName: null,
      categoryRaw: null,
      displayType: null,
      publishedAtUtc: publishedAtUtc && !isNaN(publishedAtUtc.getTime()) ? publishedAtUtc : null,
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

  return items;
};

export async function fetchYonglinNews(): Promise<ExpandedSourceFetchResult> {
  const url = "https://www.yonglin.org.tw/news/list";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parseYonglinHtml(res.text, "https://www.yonglin.org.tw");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 2. 兒福聯盟－活動消息 (Children Welfare League - Events)
// ---------------------------------------------------------------------------
export const parseChildrenEventsHtml = (html: string, baseUrl = "https://www.children.org.tw"): EnrichedRssItem[] => {
  const $ = load(html);
  const items: EnrichedRssItem[] = [];
  const seen = new Set<string>();

  const candidates = $("a[href*='/news/detail/'], a[href*='/news/'], .list-box, .news-item").toArray();
  for (const el of candidates) {
    const $el = $(el);
    const anchor = $el.is("a") ? $el : $el.find("a[href*='/news/']").first();
    const rawHref = anchor.attr("href");
    if (!rawHref || rawHref.includes("cat=") || rawHref === "/news" || rawHref === "/news/index") continue;

    const canonicalUrl = toAbsoluteUrl(rawHref, baseUrl);
    if (seen.has(canonicalUrl)) continue;

    const title = (
      anchor.find("h2, h3, h4, .title").first().text() ||
      anchor.attr("title") ||
      anchor.text()
    ).trim().replace(/\s+/g, " ");

    if (!title || title.length < 5) continue;
    seen.add(canonicalUrl);

    const dateText = $el.find(".date, time, .time, span").text() || anchor.text();
    const publishedAtUtc = parseTaiwanDateToUtc(dateText);

    const descText = ($el.find("p, .desc, .summary").first().text() || "").trim().replace(/\s+/g, " ");
    const imgSrc = anchor.find("img").attr("src") || $el.find("img").attr("src");
    const assets: NewsAsset[] = [];
    if (imgSrc) {
      assets.push({ assetType: "image", title: null, url: toAbsoluteUrl(imgSrc, baseUrl), sortOrder: 0 });
    }

    const externalId = canonicalUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "") || sha256(canonicalUrl).slice(0, 16);
    const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, publishedAtUtc }));

    items.push({
      sourceName: "children",
      feedCode: "children_events",
      feedName: "兒福聯盟－活動消息",
      externalId,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      title,
      descriptionHtml: descText,
      descriptionText: descText,
      detailHtml: null,
      detailText: null,
      deptName: null,
      categoryRaw: null,
      displayType: null,
      publishedAtUtc: publishedAtUtc && !isNaN(publishedAtUtc.getTime()) ? publishedAtUtc : null,
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

  return items;
};

export async function fetchChildrenEvents(): Promise<ExpandedSourceFetchResult> {
  const url = "https://www.children.org.tw/news/index?cat=%E6%B4%BB%E5%8B%95%E6%B6%88%E6%81%AF";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parseChildrenEventsHtml(res.text, "https://www.children.org.tw");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 3. 兒福聯盟－調查研究 (Children Welfare League - Research)
// ---------------------------------------------------------------------------
export const parseChildrenResearchHtml = (html: string, baseUrl = "https://www.children.org.tw"): EnrichedRssItem[] => {
  const $ = load(html);
  const items: EnrichedRssItem[] = [];
  const seen = new Set<string>();

  const candidates = $("a[href*='/publication_research/'], .research-item, .card").toArray();
  for (const el of candidates) {
    const $el = $(el);
    const anchor = $el.is("a") ? $el : $el.find("a[href*='/publication_research/']").first();
    const rawHref = anchor.attr("href");
    if (!rawHref || rawHref === "/publication_research/treasure_chest" || rawHref.includes("#cat_area")) continue;

    const canonicalUrl = toAbsoluteUrl(rawHref, baseUrl);
    if (seen.has(canonicalUrl)) continue;

    const title = (
      anchor.find("h2, h3, h4, .title").first().text() ||
      anchor.attr("title") ||
      anchor.text()
    ).trim().replace(/\s+/g, " ");

    if (!title || title.length < 5) continue;
    seen.add(canonicalUrl);

    const dateText = $el.find(".date, time, .time, span").text() || anchor.text();
    const publishedAtUtc = parseTaiwanDateToUtc(dateText);

    const descText = ($el.find("p, .desc, .summary").first().text() || "").trim().replace(/\s+/g, " ");
    const imgSrc = anchor.find("img").attr("src") || $el.find("img").attr("src");
    const assets: NewsAsset[] = [];
    if (imgSrc) {
      assets.push({ assetType: "image", title: null, url: toAbsoluteUrl(imgSrc, baseUrl), sortOrder: 0 });
    }

    const externalId = canonicalUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "") || sha256(canonicalUrl).slice(0, 16);
    const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, publishedAtUtc }));

    items.push({
      sourceName: "children",
      feedCode: "children_research",
      feedName: "兒福聯盟－調查研究",
      externalId,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      title,
      descriptionHtml: descText,
      descriptionText: descText,
      detailHtml: null,
      detailText: null,
      deptName: null,
      categoryRaw: null,
      displayType: null,
      publishedAtUtc: publishedAtUtc && !isNaN(publishedAtUtc.getTime()) ? publishedAtUtc : null,
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

  return items;
};

export async function fetchChildrenResearch(): Promise<ExpandedSourceFetchResult> {
  const url = "https://www.children.org.tw/publication_research/treasure_chest#cat_area";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parseChildrenResearchHtml(res.text, "https://www.children.org.tw");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 4. 教育部家庭教育網 (MOE Family Education)
// ---------------------------------------------------------------------------
export const parseMoeFamilyEduHtml = (html: string, baseUrl = "https://familyedu.moe.gov.tw"): EnrichedRssItem[] => {
  const $ = load(html);
  const items: EnrichedRssItem[] = [];
  const seen = new Set<string>();

  const rows = $("table tr, .list-table tr, a[href*='docDetail.aspx']").toArray();
  for (const el of rows) {
    const $el = $(el);
    const anchor = $el.is("a") ? $el : $el.find("a[href*='docDetail.aspx'], a[href*='docList.aspx']").first();
    const rawHref = anchor.attr("href");
    if (!rawHref || !rawHref.includes("docDetail.aspx")) continue;

    const canonicalUrl = toAbsoluteUrl(rawHref, baseUrl);
    if (seen.has(canonicalUrl)) continue;

    const title = (anchor.attr("title") || anchor.text()).trim().replace(/\s+/g, " ");
    if (!title || title.length < 4) continue;
    seen.add(canonicalUrl);

    const dateText = $el.find("td, .date, time").text();
    const publishedAtUtc = parseTaiwanDateToUtc(dateText);

    const externalId = canonicalUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "") || sha256(canonicalUrl).slice(0, 16);
    const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, publishedAtUtc }));

    items.push({
      sourceName: "moe_familyedu",
      feedCode: "moe_familyedu",
      feedName: "教育部家庭教育網",
      externalId,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      title,
      descriptionHtml: "",
      descriptionText: "",
      detailHtml: null,
      detailText: null,
      deptName: "教育部",
      categoryRaw: null,
      displayType: null,
      publishedAtUtc: publishedAtUtc && !isNaN(publishedAtUtc.getTime()) ? publishedAtUtc : null,
      publicBeginAtTaipei: null,
      publicEndAtTaipei: null,
      payloadHash,
      assets: [],
      metaTitle: "",
      metaDescription: "",
      keywords: "",
      geoSummary: "",
    });
  }

  return items;
};

export async function fetchMoeFamilyEdu(): Promise<ExpandedSourceFetchResult> {
  const url = "https://familyedu.moe.gov.tw/docList.aspx?uid=28&pid=27";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parseMoeFamilyEduHtml(res.text, "https://familyedu.moe.gov.tw");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 5. 衛福部社家署－最新消息 (SFAA - Social and Family Affairs Administration)
// ---------------------------------------------------------------------------
export const parseSfaaNewsHtml = (html: string, baseUrl = "https://www.sfaa.gov.tw"): EnrichedRssItem[] => {
  const $ = load(html);
  const items: EnrichedRssItem[] = [];
  const seen = new Set<string>();

  const rows = $("table tr, .list-item, a[href*='/sfaa/detail/'], a[href*='/detail/']").toArray();
  for (const el of rows) {
    const $el = $(el);
    const anchor = $el.is("a") ? $el : $el.find("a[href*='/detail/'], a[href*='/sfaa/']").first();
    const rawHref = anchor.attr("href");
    if (!rawHref || rawHref === "/sfaa/list/5cX" || !rawHref.includes("detail")) continue;

    const canonicalUrl = toAbsoluteUrl(rawHref, baseUrl);
    if (seen.has(canonicalUrl)) continue;

    const title = (anchor.attr("title") || anchor.text()).trim().replace(/\s+/g, " ");
    if (!title || title.length < 4) continue;
    seen.add(canonicalUrl);

    const dateText = $el.find("td, .date, time, span").text();
    const publishedAtUtc = parseTaiwanDateToUtc(dateText);

    const externalId = canonicalUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "") || sha256(canonicalUrl).slice(0, 16);
    const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, publishedAtUtc }));

    items.push({
      sourceName: "sfaa",
      feedCode: "sfaa_news",
      feedName: "衛福部社家署",
      externalId,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      title,
      descriptionHtml: "",
      descriptionText: "",
      detailHtml: null,
      detailText: null,
      deptName: "衛生福利部社會及家庭署",
      categoryRaw: null,
      displayType: null,
      publishedAtUtc: publishedAtUtc && !isNaN(publishedAtUtc.getTime()) ? publishedAtUtc : null,
      publicBeginAtTaipei: null,
      publicEndAtTaipei: null,
      payloadHash,
      assets: [],
      metaTitle: "",
      metaDescription: "",
      keywords: "",
      geoSummary: "",
    });
  }

  return items;
};

export async function fetchSfaaNews(): Promise<ExpandedSourceFetchResult> {
  const url = "https://www.sfaa.gov.tw/sfaa/list/5cX";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parseSfaaNewsHtml(res.text, "https://www.sfaa.gov.tw");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 6. Hello 醫師 (Hello Yishi Health) - Commercial Media
// ---------------------------------------------------------------------------
export const parseHelloYishiHealthHtml = (html: string, baseUrl = "https://helloyishi.com.tw"): EnrichedRssItem[] => {
  const $ = load(html);
  const items: EnrichedRssItem[] = [];
  const seen = new Set<string>();

  const anchors = $("a[href*='/health/'], a[href*='/healthy-living/'], a[href*='/parenting/']").toArray();
  for (const el of anchors) {
    const anchor = $(el);
    const rawHref = anchor.attr("href");
    if (!rawHref || rawHref === "/health/" || rawHref === "/health" || rawHref === "/") continue;

    const canonicalUrl = toAbsoluteUrl(rawHref, baseUrl);
    if (seen.has(canonicalUrl)) continue;

    const title = (
      anchor.find("h2, h3, p, span").first().text() ||
      anchor.attr("title") ||
      anchor.text()
    ).trim().replace(/\s+/g, " ");

    if (!title || title.length < 5) continue;
    seen.add(canonicalUrl);

    const imgSrc = anchor.find("img").attr("src") || anchor.find("img").attr("data-src");
    const assets: NewsAsset[] = [];
    if (imgSrc) {
      assets.push({ assetType: "image", title: null, url: toAbsoluteUrl(imgSrc, baseUrl), sortOrder: 0 });
    }

    const externalId = canonicalUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "") || sha256(canonicalUrl).slice(0, 16);
    const payloadHash = sha256(JSON.stringify({ title, canonicalUrl }));

    items.push({
      sourceName: "helloyishi",
      feedCode: "helloyishi_health",
      feedName: "Hello 醫師",
      externalId,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      title,
      descriptionHtml: "",
      descriptionText: "",
      detailHtml: null,
      detailText: null,
      deptName: null,
      categoryRaw: null,
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

  return items;
};

export async function fetchHelloYishiHealth(): Promise<ExpandedSourceFetchResult> {
  const url = "https://helloyishi.com.tw/health/";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parseHelloYishiHealthHtml(res.text, "https://helloyishi.com.tw");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 7. 康健大人社團 (CommonHealth Club) - Commercial Media
// ---------------------------------------------------------------------------
export const parseCommonHealthClubHtml = (html: string, baseUrl = "https://club.commonhealth.com.tw"): EnrichedRssItem[] => {
  const $ = load(html);
  const items: EnrichedRssItem[] = [];
  const seen = new Set<string>();

  const cards = $("a[href*='/article/'], .article-card, .card").toArray();
  for (const el of cards) {
    const $el = $(el);
    const anchor = $el.is("a") ? $el : $el.find("a[href*='/article/']").first();
    const rawHref = anchor.attr("href");
    if (!rawHref || !rawHref.includes("/article/")) continue;

    const canonicalUrl = toAbsoluteUrl(rawHref, baseUrl);
    if (seen.has(canonicalUrl)) continue;

    const title = (
      anchor.find("h2, h3, h4, .title").first().text() ||
      anchor.attr("title") ||
      anchor.text()
    ).trim().replace(/\s+/g, " ");

    if (!title || title.length < 5) continue;
    seen.add(canonicalUrl);

    const dateText = $el.find(".date, time, .time, span").text() || anchor.text();
    const publishedAtUtc = parseTaiwanDateToUtc(dateText);

    const descText = ($el.find("p, .desc, .summary").first().text() || "").trim().replace(/\s+/g, " ");
    const imgSrc = anchor.find("img").attr("src") || $el.find("img").attr("src");
    const assets: NewsAsset[] = [];
    if (imgSrc) {
      assets.push({ assetType: "image", title: null, url: toAbsoluteUrl(imgSrc, baseUrl), sortOrder: 0 });
    }

    const externalId = canonicalUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "") || sha256(canonicalUrl).slice(0, 16);
    const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, publishedAtUtc }));

    items.push({
      sourceName: "commonhealth_club",
      feedCode: "commonhealth_club_new",
      feedName: "康健大人社團",
      externalId,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      title,
      descriptionHtml: descText,
      descriptionText: descText,
      detailHtml: null,
      detailText: null,
      deptName: null,
      categoryRaw: null,
      displayType: null,
      publishedAtUtc: publishedAtUtc && !isNaN(publishedAtUtc.getTime()) ? publishedAtUtc : null,
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

  return items;
};

export async function fetchCommonHealthClub(): Promise<ExpandedSourceFetchResult> {
  const url = "https://club.commonhealth.com.tw/new";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parseCommonHealthClubHtml(res.text, "https://club.commonhealth.com.tw");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 8, 9, 10. 關鍵評論網 (The News Lens) - Commercial Media
// ---------------------------------------------------------------------------
export const parseTheNewsLensHtml = (
  html: string,
  feedCode: "thenewslens_health" | "thenewslens_lifestyle" | "thenewslens_elderly",
  feedName: string,
  baseUrl = "https://www.thenewslens.com",
): EnrichedRssItem[] => {
  const $ = load(html);
  const items: EnrichedRssItem[] = [];
  const seen = new Set<string>();

  const cards = $("a[href*='/article/'], .article-card, .post-item").toArray();
  for (const el of cards) {
    const $el = $(el);
    const anchor = $el.is("a") ? $el : $el.find("a[href*='/article/']").first();
    const rawHref = anchor.attr("href");
    if (!rawHref || !rawHref.includes("/article/")) continue;

    const canonicalUrl = toAbsoluteUrl(rawHref, baseUrl);
    if (seen.has(canonicalUrl)) continue;

    const title = (
      anchor.find("h2, h3, h4, .title").first().text() ||
      anchor.attr("title") ||
      anchor.text()
    ).trim().replace(/\s+/g, " ");

    if (!title || title.length < 5) continue;
    seen.add(canonicalUrl);

    const dateText = $el.find(".date, time, .time, span").text() || anchor.text();
    const publishedAtUtc = parseTaiwanDateToUtc(dateText);

    const descText = ($el.find("p, .desc, .summary").first().text() || "").trim().replace(/\s+/g, " ");
    const imgSrc = anchor.find("img").attr("src") || $el.find("img").attr("src");
    const assets: NewsAsset[] = [];
    if (imgSrc) {
      assets.push({ assetType: "image", title: null, url: toAbsoluteUrl(imgSrc, baseUrl), sortOrder: 0 });
    }

    const externalId = canonicalUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "") || sha256(canonicalUrl).slice(0, 16);
    const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, publishedAtUtc }));

    items.push({
      sourceName: "thenewslens",
      feedCode,
      feedName,
      externalId,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      title,
      descriptionHtml: descText,
      descriptionText: descText,
      detailHtml: null,
      detailText: null,
      deptName: null,
      categoryRaw: null,
      displayType: null,
      publishedAtUtc: publishedAtUtc && !isNaN(publishedAtUtc.getTime()) ? publishedAtUtc : null,
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

  return items;
};

export async function fetchTheNewsLensHealth(): Promise<ExpandedSourceFetchResult> {
  const url = "https://www.thenewslens.com/category/health";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parseTheNewsLensHtml(res.text, "thenewslens_health", "關鍵評論網－健康");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

export async function fetchTheNewsLensLifestyle(): Promise<ExpandedSourceFetchResult> {
  const url = "https://www.thenewslens.com/category/lifestyle";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parseTheNewsLensHtml(res.text, "thenewslens_lifestyle", "關鍵評論網－生活");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

export async function fetchTheNewsLensElderly(): Promise<ExpandedSourceFetchResult> {
  const url = "https://www.thenewslens.com/category/elderly";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parseTheNewsLensHtml(res.text, "thenewslens_elderly", "關鍵評論網－銀髮");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 11, 12, 13. PChome 新聞 (PChome News) - Commercial Media
// ---------------------------------------------------------------------------
export const parsePchomeHtml = (
  html: string,
  feedCode: "pchome_health" | "pchome_pet" | "pchome_living",
  feedName: string,
  baseUrl = "https://news.pchome.com.tw",
): EnrichedRssItem[] => {
  const $ = load(html);
  const items: EnrichedRssItem[] = [];
  const seen = new Set<string>();

  const cards = $("a[href*='/article/'], a[href*='/cat/'], .news_list li").toArray();
  for (const el of cards) {
    const $el = $(el);
    const anchor = $el.is("a") ? $el : $el.find("a[href*='/article/'], a[href*='news.pchome']").first();
    const rawHref = anchor.attr("href");
    if (!rawHref || !rawHref.includes("article")) continue;

    const canonicalUrl = toAbsoluteUrl(rawHref, baseUrl);
    if (seen.has(canonicalUrl)) continue;

    const title = (
      anchor.find("h2, h3, h4, .title").first().text() ||
      anchor.attr("title") ||
      anchor.text()
    ).trim().replace(/\s+/g, " ");

    if (!title || title.length < 5) continue;
    seen.add(canonicalUrl);

    const dateText = $el.find(".date, time, .time, span").text() || anchor.text();
    const publishedAtUtc = parseTaiwanDateToUtc(dateText);

    const descText = ($el.find("p, .desc, .summary").first().text() || "").trim().replace(/\s+/g, " ");
    const imgSrc = anchor.find("img").attr("src") || $el.find("img").attr("src");
    const assets: NewsAsset[] = [];
    if (imgSrc) {
      assets.push({ assetType: "image", title: null, url: toAbsoluteUrl(imgSrc, baseUrl), sortOrder: 0 });
    }

    const externalId = canonicalUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "") || sha256(canonicalUrl).slice(0, 16);
    const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, publishedAtUtc }));

    items.push({
      sourceName: "pchome",
      feedCode,
      feedName,
      externalId,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      title,
      descriptionHtml: descText,
      descriptionText: descText,
      detailHtml: null,
      detailText: null,
      deptName: null,
      categoryRaw: null,
      displayType: null,
      publishedAtUtc: publishedAtUtc && !isNaN(publishedAtUtc.getTime()) ? publishedAtUtc : null,
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

  return items;
};

export async function fetchPchomeHealth(): Promise<ExpandedSourceFetchResult> {
  const url = "https://news.pchome.com.tw/cat/healthcare";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parsePchomeHtml(res.text, "pchome_health", "PChome－健康新聞");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

export async function fetchPchomePet(): Promise<ExpandedSourceFetchResult> {
  const url = "https://news.pchome.com.tw/cat/pet/hot";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parsePchomeHtml(res.text, "pchome_pet", "PChome－熱門寵物");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

export async function fetchPchomeLiving(): Promise<ExpandedSourceFetchResult> {
  const url = "https://news.pchome.com.tw/cat/living";
  try {
    const res = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, httpStatus: res.status, itemCount: 0, items: [], errorMessage: `HTTP ${res.status}` };
    }
    const items = parsePchomeHtml(res.text, "pchome_living", "PChome－生活休閒");
    return { ok: true, httpStatus: res.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}
