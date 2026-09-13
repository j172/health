import { load } from "cheerio";
import type { EnrichedRssItem, FeedCode, NewsAsset } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";
import { sha256, toAbsoluteUrl } from "@/lib/server/rss/scraperUtils";

export interface NpoFetchResult {
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

export const parseYmdToUtc = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const m = value.match(/(\d{4})[./\s-年]+(\d{1,2})[./\s-月]+(\d{1,2})/);
  if (!m) {
    const isoDate = new Date(value);
    return Number.isNaN(isoDate.getTime()) ? null : isoDate;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const utcMillis = Date.UTC(year, month - 1, day, 0, 0, 0);
  const date = new Date(utcMillis);
  return Number.isNaN(date.getTime()) ? null : date;
};

// ---------------------------------------------------------------------------
// 1. 國際特赦組織台灣分會 (Amnesty International Taiwan)
// ---------------------------------------------------------------------------
export async function fetchAmnestyNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "amnesty_news";
  const sourceName = "amnesty";
  const feedName = "國際特赦組織台灣分會";
  const url = "https://www.amnesty.tw/news";

  try {
    const response = await httpGetText(url, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 15_000,
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    for (const el of $(".views-row").toArray()) {
      const anchor = $(el).find(".entity-title a");
      const href = anchor.attr("href");
      const title = anchor.text().trim();
      if (!href || !title) continue;

      const canonicalUrl = toAbsoluteUrl("https://www.amnesty.tw", href);
      if (seen.has(canonicalUrl)) continue;
      seen.add(canonicalUrl);

      const timeEl = $(el).find(".entity-date time");
      const dateStr = timeEl.attr("datetime") || timeEl.text().trim();
      const publishedAtUtc = dateStr ? new Date(dateStr) : null;
      const category = $(el).find(".entity-category-topic").text().trim() || null;
      const subtitle = $(el).find(".entity-category-country").text().trim() || title;

      const rawImg = $(el).find(".entity-img img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        const fullImg = toAbsoluteUrl("https://www.amnesty.tw", rawImg);
        const localPath = await downloadArticleImage(fullImg).catch(() => null);
        if (localPath) {
          assets.push({ assetType: "image" as const, title: null, url: localPath, sortOrder: 0 });
        }
      }

      const externalId = canonicalUrl.split("/node/")[1] || sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, publishedAtUtc }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: subtitle,
        descriptionText: subtitle,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: category,
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

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 2. 台灣公益資訊中心 公益新訊 (Taiwan NPO Information Center)
// ---------------------------------------------------------------------------
export async function fetchNpoHotMsg(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "npo_hotmsg";
  const sourceName = "npo_tw";
  const feedName = "台灣公益資訊中心";
  const url = "https://www.npo.org.tw/hotmsglist.aspx?tid=127";

  try {
    const response = await httpGetText(url, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 15_000,
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    for (const tr of $("table tr").toArray()) {
      const onclick = $(tr).attr("onclick") || "";
      const match = onclick.match(/location\.href='([^']+)'/);
      if (!match) continue;

      const path = match[1];
      const canonicalUrl = toAbsoluteUrl("https://www.npo.org.tw", path);
      if (seen.has(canonicalUrl)) continue;
      seen.add(canonicalUrl);

      const title = $(tr).find('td[data-th="新訊主題"]').text().trim();
      const dateStr = $(tr).find('td[data-th="開始日期"]').text().trim();
      const category = $(tr).find('td[data-th="新訊屬性"]').text().trim() || null;
      if (!title) continue;

      const publishedAtUtc = parseYmdToUtc(dateStr);
      const sernoMatch = path.match(/serno=(\d+)/);
      const externalId = sernoMatch ? sernoMatch[1] : sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, dateStr }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: category,
        displayType: null,
        publishedAtUtc,
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

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 3. 中華民國唐氏症基金會 (Down Syndrome Foundation ROC)
// ---------------------------------------------------------------------------
export async function fetchDownSyndromeNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "down_syndrome_news";
  const sourceName = "down_syndrome";
  const feedName = "唐氏症基金會";
  const url = "https://www.rocdown-syndrome.org.tw/news/all/1";

  try {
    const response = await httpGetText(url, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 15_000,
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    for (const el of $("a[href*='/news_detail/']").toArray()) {
      const rawHref = $(el).attr("href");
      if (!rawHref) continue;
      const canonicalUrl = toAbsoluteUrl("https://www.rocdown-syndrome.org.tw", rawHref);
      if (seen.has(canonicalUrl)) continue;
      seen.add(canonicalUrl);

      const parent = $(el).parent();
      const title =
        parent.find('[itemprop="name"]').text().trim() ||
        $(el).attr("title")?.trim() ||
        $(el).text().trim();
      if (!title) continue;

      const dateStr = parent.find('[itemprop="datePublished"]').attr("datetime") || parent.find(".date").text().trim();
      const publishedAtUtc = parseYmdToUtc(dateStr);
      const desc = parent.find('[itemprop="description"]').text().trim() || title;

      const rawImg = parent.find("img").attr("data-src") || parent.find("img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        const fullImg = toAbsoluteUrl("https://www.rocdown-syndrome.org.tw", rawImg);
        const localPath = await downloadArticleImage(fullImg).catch(() => null);
        if (localPath) {
          assets.push({ assetType: "image" as const, title: null, url: localPath, sortOrder: 0 });
        }
      }

      const externalId = canonicalUrl.split("/news_detail/")[1] || sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, dateStr }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: desc,
        descriptionText: desc,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: null,
        displayType: null,
        publishedAtUtc,
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

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 4. 台灣世界展望會 (World Vision Taiwan)
// ---------------------------------------------------------------------------
export async function fetchWorldVisionArticles(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "worldvision_articles";
  const sourceName = "worldvision";
  const feedName = "台灣世界展望會";
  const url = "https://www.worldvision.org.tw/articles/category/7";

  try {
    const response = await httpGetText(url, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 15_000,
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }

    const $ = load(response.text);
    let payload: any = null;
    $("script").each((_, el) => {
      const c = $(el).html();
      if (c && c.length > 5000 && c.startsWith("[[")) {
        try {
          payload = JSON.parse(c);
        } catch {}
      }
    });

    if (!payload || !Array.isArray(payload)) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: "Could not parse Nuxt 3 payload" };
    }
    const pool: any[] = payload;

    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < pool.length; i++) {
      const item: any = pool[i];
      if (item && typeof item === "object" && !Array.isArray(item) && item.category_id !== undefined && item.title_zh_tw !== undefined) {
        const idVal = typeof item.id === "number" ? pool[item.id] ?? item.id : item.id;
        const titleVal = typeof item.title_zh_tw === "number" ? pool[item.title_zh_tw] : item.title_zh_tw;
        if (!idVal || !titleVal || typeof titleVal !== "string") continue;

        const canonicalUrl = `https://www.worldvision.org.tw/articles/${idVal}`;
        if (seen.has(canonicalUrl)) continue;
        seen.add(canonicalUrl);

        const descVal = typeof item.meta_description_zh_tw === "number" ? pool[item.meta_description_zh_tw] : item.meta_description_zh_tw;
        const desc = typeof descVal === "string" ? descVal : titleVal;

        const dateVal = typeof item.enabled_from === "number" ? pool[item.enabled_from] : (typeof item.created_at === "number" ? pool[item.created_at] : item.enabled_from);
        const publishedAtUtc = dateVal ? new Date(dateVal) : null;

        const payloadHash = sha256(JSON.stringify({ title: titleVal, canonicalUrl, dateVal }));

        items.push({
          sourceName,
          feedCode,
          feedName,
          externalId: String(idVal),
          canonicalUrl,
          sourceUrl: canonicalUrl,
          title: titleVal.trim(),
          descriptionHtml: desc.trim(),
          descriptionText: desc.trim(),
          detailHtml: null,
          detailText: null,
          deptName: null,
          categoryRaw: "展望專欄",
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
    }

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 5. 心路基金會 (Syin-Lu Social Welfare Foundation)
// ---------------------------------------------------------------------------
export async function fetchSyinluNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "syinlu_news";
  const sourceName = "syinlu";
  const feedName = "心路基金會";
  const url = "https://www.syinlu.org.tw/news/index";

  try {
    const response = await httpGetText(url, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 15_000,
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    for (const el of $("a[href*='/news/news_detail/']").toArray()) {
      const rawHref = $(el).attr("href");
      if (!rawHref) continue;
      const canonicalUrl = toAbsoluteUrl("https://www.syinlu.org.tw", rawHref);
      if (seen.has(canonicalUrl)) continue;
      seen.add(canonicalUrl);

      const rawText = $(el).text().replace(/\s+/g, " ").trim();
      const dateMatch = rawText.match(/(\d{4}\.\d{2}\.\d{2})/);
      const publishedAtUtc = dateMatch ? parseYmdToUtc(dateMatch[1]) : null;

      let title = rawText;
      if (dateMatch) {
        title = title.replace(dateMatch[1], "").trim();
      }
      title = title.replace(/^(心路服務|心路活動|心路公告|企業合作|心路消息)\s*(閱讀更多)?/g, "").trim();
      if (!title) title = rawText;

      const rawImg = $(el).find("img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        const fullImg = toAbsoluteUrl("https://www.syinlu.org.tw", rawImg);
        const localPath = await downloadArticleImage(fullImg).catch(() => null);
        if (localPath) {
          assets.push({ assetType: "image" as const, title: null, url: localPath, sortOrder: 0 });
        }
      }

      const externalId = canonicalUrl.split("/news_detail/")[1] || sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, dateMatch: dateMatch?.[1] }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: null,
        displayType: null,
        publishedAtUtc,
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

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 6. 世界和平會 (World Peace)
// ---------------------------------------------------------------------------
export async function fetchWorldPeaceNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "worldpeace";
  const sourceName = "worldpeace";
  const feedName = "世界和平會";
  const urls = [
    { url: "https://www.worldpeace.org.tw/news_msg.php", cat: "訊息公告" },
    { url: "https://www.worldpeace.org.tw/news_report.php", cat: "服務報導" },
  ];

  try {
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();
    let lastStatus = 200;

    for (const { url, cat } of urls) {
      const response = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
      lastStatus = response.status;
      if (response.status < 200 || response.status >= 300) continue;

      const $ = load(response.text);
      for (const el of $("a[href*='news_msg_in.php'], a[href*='news_report_in.php']").toArray()) {
        const rawHref = $(el).attr("href");
        if (!rawHref) continue;
        const canonicalUrl = toAbsoluteUrl("https://www.worldpeace.org.tw", rawHref);
        if (seen.has(canonicalUrl)) continue;
        seen.add(canonicalUrl);

        const rawText = $(el).text().replace(/\s+/g, " ").trim();
        const dateMatch = rawText.match(/(\d{4}-\d{2}-\d{2})/);
        const publishedAtUtc = dateMatch ? parseYmdToUtc(dateMatch[1]) : null;

        let title = rawText.replace(/More$/, "").trim();
        if (dateMatch) {
          title = title.split(dateMatch[1])[0].trim();
        }
        if (!title) title = rawText;

        const rawImg = $(el).find("img").attr("src");
        const assets: NewsAsset[] = [];
        if (rawImg) {
          const fullImg = toAbsoluteUrl("https://www.worldpeace.org.tw", rawImg);
          const localPath = await downloadArticleImage(fullImg).catch(() => null);
          if (localPath) {
            assets.push({ assetType: "image" as const, title: null, url: localPath, sortOrder: 0 });
          }
        }

        const idMatch = rawHref.match(/id=(\d+)/);
        const externalId = idMatch ? `${cat === "服務報導" ? "report" : "msg"}_${idMatch[1]}` : sha256(canonicalUrl).slice(0, 16);
        const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, dateMatch: dateMatch?.[1] }));

        items.push({
          sourceName,
          feedCode,
          feedName,
          externalId,
          canonicalUrl,
          sourceUrl: canonicalUrl,
          title,
          descriptionHtml: title,
          descriptionText: title,
          detailHtml: null,
          detailText: null,
          deptName: null,
          categoryRaw: cat,
          displayType: null,
          publishedAtUtc,
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
    }

    return { ok: true, httpStatus: lastStatus, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 7. 綠色和平 (Greenpeace)
// ---------------------------------------------------------------------------
export async function fetchGreenpeaceNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "greenpeace";
  const sourceName = "greenpeace";
  const feedName = "綠色和平";
  const url = "https://www.greenpeace.org/taiwan/press-media/press-releases/";

  try {
    const response = await httpGetText(url, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 15_000,
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }

    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    for (const el of $("a[href*='/taiwan/press/']").toArray()) {
      const rawHref = $(el).attr("href");
      if (!rawHref || rawHref === url) continue;
      const canonicalUrl = toAbsoluteUrl("https://www.greenpeace.org", rawHref);
      if (seen.has(canonicalUrl)) continue;
      seen.add(canonicalUrl);

      const rawText = $(el).text().replace(/\s+/g, " ").trim();
      const dateMatch = rawText.match(/(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/);
      const publishedAtUtc = dateMatch ? parseYmdToUtc(dateMatch[1]) : null;

      let title = rawText;
      if (dateMatch) {
        title = title.replace(dateMatch[1], "").trim();
      }
      title = title.replace(/^(氣候|減塑|海洋|森林|能源|全球)?\s*(新聞稿)?/g, "").trim();
      if (!title) title = rawText;

      const rawImg = $(el).find("img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        const fullImg = toAbsoluteUrl("https://www.greenpeace.org", rawImg);
        const localPath = await downloadArticleImage(fullImg).catch(() => null);
        if (localPath) {
          assets.push({ assetType: "image" as const, title: null, url: localPath, sortOrder: 0 });
        }
      }

      const pressIdMatch = rawHref.match(/\/press\/(\d+)\//);
      const externalId = pressIdMatch ? pressIdMatch[1] : sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, dateMatch: dateMatch?.[1] }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "新聞稿",
        displayType: null,
        publishedAtUtc,
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

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 7. 家扶基金會 (CCF)
// ---------------------------------------------------------------------------
export async function fetchCcfNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "ccf_news";
  const sourceName = "ccf";
  const feedName = "家扶基金會";
  const url = "https://www.ccf.org.tw/news";

  try {
    const response = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }
    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    $("a[href*='/news/']").each((_, el) => {
      const href = $(el).attr("href");
      const title = $(el).find(".title, h3, h4, p").text().trim() || $(el).text().trim().split("\n")[0].trim();
      if (!href || !title || title.length < 4 || title.includes("更多") || title.includes("最新消息")) return;

      const canonicalUrl = toAbsoluteUrl("https://www.ccf.org.tw", href);
      if (seen.has(canonicalUrl)) return;
      seen.add(canonicalUrl);

      const dateMatch = $(el).text().match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
      const publishedAtUtc = dateMatch ? parseYmdToUtc(dateMatch[1]) : new Date();

      const rawImg = $(el).find("img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        assets.push({ assetType: "image", title: null, url: toAbsoluteUrl("https://www.ccf.org.tw", rawImg), sortOrder: 0 });
      }

      const externalId = canonicalUrl.split("/news/")[1]?.replace(/\/detail.*$/, "") || sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "最新消息",
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    });

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 8. 聯合勸募 (United Way Taiwan)
// ---------------------------------------------------------------------------
export async function fetchUnitedWayNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "unitedway_news";
  const sourceName = "unitedway";
  const feedName = "聯合勸募";
  const url = "https://www.unitedway.org.tw/news.aspx?NewsType=1";

  try {
    const response = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }
    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    $(".grid-news figure a, a[href*='news_page']").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const canonicalUrl = toAbsoluteUrl("https://www.unitedway.org.tw", href);
      if (seen.has(canonicalUrl)) return;
      seen.add(canonicalUrl);

      const dateText = $(el).find("h2 i, time").text().trim();
      let title = $(el).find("h2").text().replace(dateText, "").trim();
      if (!title) title = $(el).text().trim().replace(/\s+/g, " ");
      if (!title || title.length < 4) return;

      const publishedAtUtc = dateText ? parseYmdToUtc(dateText) : new Date();
      const rawImg = $(el).find(".img img, img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        assets.push({ assetType: "image", title: null, url: toAbsoluteUrl("https://www.unitedway.org.tw", rawImg), sortOrder: 0 });
      }

      const externalId = canonicalUrl.match(/SNo=(\d+)/i)?.[1] || sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "新聞發佈",
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    });

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 9. 伊甸社會福利基金會 (Eden Social Welfare Foundation)
// ---------------------------------------------------------------------------
export async function fetchEdenNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "eden_news";
  const sourceName = "eden";
  const feedName = "伊甸基金會";
  const url = "https://www.eden.org.tw/news/news-release/";

  try {
    const response = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }
    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    $("a[href*='/news/detail/'], a[href*='/news-release/detail/']").each((_, el) => {
      const href = $(el).attr("href");
      const title = $(el).find("h3, h4, .title, p").text().trim() || $(el).text().trim().replace(/\s+/g, " ");
      if (!href || !title || title.length < 4 || title.includes("最新消息")) return;

      const canonicalUrl = toAbsoluteUrl("https://www.eden.org.tw", href);
      if (seen.has(canonicalUrl)) return;
      seen.add(canonicalUrl);

      const dateMatch = $(el).text().match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
      const publishedAtUtc = dateMatch ? parseYmdToUtc(dateMatch[1]) : new Date();

      const rawImg = $(el).find("img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        assets.push({ assetType: "image", title: null, url: toAbsoluteUrl("https://www.eden.org.tw", rawImg), sortOrder: 0 });
      }

      const externalId = canonicalUrl.match(/detail\/(\d+)/)?.[1] || sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "焦點新聞",
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    });

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 10. 華山基金會 (Elder Foundation)
// ---------------------------------------------------------------------------
export async function fetchElderNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "elder_news";
  const sourceName = "elder";
  const feedName = "華山基金會";
  const url = "https://www.elder.org.tw/contents/news";

  try {
    const response = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }
    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    $("a[href*='news_ct']").each((_, el) => {
      const href = $(el).attr("href");
      const fullText = $(el).text().trim();
      const title = fullText.split("\n")[0].trim().slice(0, 120);
      if (!href || !title || title.length < 4) return;

      const canonicalUrl = toAbsoluteUrl("https://www.elder.org.tw", href);
      if (seen.has(canonicalUrl)) return;
      seen.add(canonicalUrl);

      const dateMatch = fullText.match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
      const publishedAtUtc = dateMatch ? parseYmdToUtc(dateMatch[1]) : new Date();

      const rawImg = $(el).find("img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        assets.push({ assetType: "image", title: null, url: toAbsoluteUrl("https://www.elder.org.tw", rawImg), sortOrder: 0 });
      }

      const externalId = canonicalUrl.match(/id=(\d+)/)?.[1] || sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "最新消息",
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    });

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 11. 台灣動物緊急救援小組 (SaveDogs)
// ---------------------------------------------------------------------------
export async function fetchSaveDogsNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "savedogs_news";
  const sourceName = "savedogs";
  const feedName = "台灣動物緊急救援小組";
  const url = "https://www.savedogs.org/index.php/MediaReports";

  try {
    const response = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }
    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    $("a[href*='MediaReports/Page'], a[href*='MediaReports/detail']").each((_, el) => {
      const href = $(el).attr("href");
      const title = $(el).text().trim().replace(/\s+/g, " ");
      if (!href || !title || title.length < 5) return;

      const canonicalUrl = toAbsoluteUrl("https://www.savedogs.org", href.startsWith("/") ? href : `/index.php/${href}`);
      if (seen.has(canonicalUrl)) return;
      seen.add(canonicalUrl);

      const dateMatch = $(el).parent().text().match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
      const publishedAtUtc = dateMatch ? parseYmdToUtc(dateMatch[1]) : new Date();

      const rawImg = $(el).find("img").attr("src") || $(el).parent().find("img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        assets.push({ assetType: "image", title: null, url: toAbsoluteUrl("https://www.savedogs.org", rawImg), sortOrder: 0 });
      }

      const externalId = canonicalUrl.match(/id=(\d+)/)?.[1] || sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "媒體報導",
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    });

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 12. iGiving 公益網 (iGiving)
// ---------------------------------------------------------------------------
export async function fetchIgivingNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "igiving_news";
  const sourceName = "igiving";
  const feedName = "iGiving 公益網";
  const url = "https://www.igiving.org.tw/contents/news";

  try {
    const response = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }
    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    $("a[href*='news_ct']").each((_, el) => {
      const href = $(el).attr("href");
      const title = $(el).text().trim().replace(/\s+/g, " ");
      if (!href || !title || title.length < 4) return;

      const canonicalUrl = toAbsoluteUrl("https://www.igiving.org.tw", href);
      if (seen.has(canonicalUrl)) return;
      seen.add(canonicalUrl);

      const dateMatch = $(el).parent().text().match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
      const publishedAtUtc = dateMatch ? parseYmdToUtc(dateMatch[1]) : new Date();

      const rawImg = $(el).find("img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        assets.push({ assetType: "image", title: null, url: toAbsoluteUrl("https://www.igiving.org.tw", rawImg), sortOrder: 0 });
      }

      const externalId = canonicalUrl.match(/id=(\d+)/)?.[1] || sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "公益新聞",
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    });

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 13. 照顧情報 (Caresb)
// ---------------------------------------------------------------------------
export async function fetchCaresbNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "caresb_news";
  const sourceName = "caresb";
  const feedName = "照顧情報";
  const url = "https://caresb.etaiwan.com.tw/ads";

  try {
    const response = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }
    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    $("article a, .post-item a, .entry-title a, a[href*='/ads/']").each((_, el) => {
      const href = $(el).attr("href");
      const title = $(el).text().trim().replace(/\s+/g, " ");
      if (!href || !title || title.length < 5 || title.includes("閱讀全文")) return;

      const canonicalUrl = toAbsoluteUrl("https://caresb.etaiwan.com.tw", href);
      if (seen.has(canonicalUrl)) return;
      seen.add(canonicalUrl);

      const publishedAtUtc = new Date();
      const rawImg = $(el).find("img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        assets.push({ assetType: "image", title: null, url: toAbsoluteUrl("https://caresb.etaiwan.com.tw", rawImg), sortOrder: 0 });
      }

      const externalId = sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "照顧資訊",
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    });

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 14. 羅慧夫顱顏基金會 (NNCF)
// ---------------------------------------------------------------------------
export async function fetchNncfNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "nncf_news";
  const sourceName = "nncf";
  const feedName = "羅慧夫顱顏基金會";
  const url = "https://www.nncf.org/news/index#cat-area";

  try {
    const response = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }
    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    $("a[href*='/news/index/'], a[href*='/news/detail']").each((_, el) => {
      const href = $(el).attr("href");
      const fullText = $(el).text().trim();
      const titleMatch = fullText.match(/【[^】]+】[^\n\r]+/) || fullText.match(/[^\n\r]{6,}/);
      let title = titleMatch ? titleMatch[0].trim() : fullText.slice(0, 80);
      if (!href || !title || title.length < 4) return;

      const canonicalUrl = toAbsoluteUrl("https://www.nncf.org", href);
      if (seen.has(canonicalUrl)) return;
      seen.add(canonicalUrl);

      const dateMatch = fullText.match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
      const publishedAtUtc = dateMatch ? parseYmdToUtc(dateMatch[1]) : new Date();

      const rawImg = $(el).find("img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        assets.push({ assetType: "image", title: null, url: toAbsoluteUrl("https://www.nncf.org", rawImg), sortOrder: 0 });
      }

      const externalId = canonicalUrl.split("/news/")[1]?.replace(/[^\w-]/g, "_") || sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "基金會消息",
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    });

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 15. 志玲姊姊慈善基金會 (Chiling Charity Foundation)
// ---------------------------------------------------------------------------
export async function fetchChilingJjNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "chilingjj_news";
  const sourceName = "chilingjj";
  const feedName = "志玲姊姊慈善基金會";
  const url = "https://www.chilingjj.org/contents/news?equal[classid]=";

  try {
    const response = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }
    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    $("a[href*='news_ct']").each((_, el) => {
      const href = $(el).attr("href");
      const title = $(el).text().trim().replace(/\s+/g, " ");
      if (!href || !title || title.length < 4) return;

      const canonicalUrl = toAbsoluteUrl("https://www.chilingjj.org", href);
      if (seen.has(canonicalUrl)) return;
      seen.add(canonicalUrl);

      const dateMatch = $(el).parent().text().match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
      const publishedAtUtc = dateMatch ? parseYmdToUtc(dateMatch[1]) : new Date();

      const rawImg = $(el).find("img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        assets.push({ assetType: "image", title: null, url: toAbsoluteUrl("https://www.chilingjj.org", rawImg), sortOrder: 0 });
      }

      const externalId = canonicalUrl.match(/id=(\d+)/)?.[1] || sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "基金會消息",
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    });

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 16. 愛傳媒 (Anews)
// ---------------------------------------------------------------------------
export async function fetchAnewsNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "anews_news";
  const sourceName = "anews";
  const feedName = "愛傳媒";
  const url = "https://anews.com.tw/archives/category/%e6%96%b0%e8%81%9e";

  try {
    const response = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs: 15_000 });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
    }
    const $ = load(response.text);
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();

    $("article a[href*='/archives/'], .entry-title a").each((_, el) => {
      const href = $(el).attr("href");
      const title = $(el).text().trim().replace(/\s+/g, " ");
      if (!href || !title || title.length < 5 || title.includes("閱讀更多")) return;

      const canonicalUrl = toAbsoluteUrl("https://anews.com.tw", href);
      if (seen.has(canonicalUrl)) return;
      seen.add(canonicalUrl);

      const timeEl = $(el).closest("article").find("time");
      const dateStr = timeEl.attr("datetime") || timeEl.text().trim();
      const publishedAtUtc = dateStr ? new Date(dateStr) : new Date();

      const rawImg = $(el).closest("article").find("img").attr("src");
      const assets: NewsAsset[] = [];
      if (rawImg) {
        assets.push({ assetType: "image", title: null, url: toAbsoluteUrl("https://anews.com.tw", rawImg), sortOrder: 0 });
      }

      const externalId = canonicalUrl.match(/archives\/(\d+)/)?.[1] || sha256(canonicalUrl).slice(0, 16);
      const payloadHash = sha256(JSON.stringify({ title, canonicalUrl }));

      items.push({
        sourceName,
        feedCode,
        feedName,
        externalId,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title,
        descriptionHtml: title,
        descriptionText: title,
        detailHtml: null,
        detailText: null,
        deptName: null,
        categoryRaw: "社會公益",
        displayType: null,
        publishedAtUtc,
        publicBeginAtTaipei: null,
        publicEndAtTaipei: null,
        payloadHash,
        assets,
        metaTitle: "",
        metaDescription: "",
        keywords: "",
        geoSummary: "",
      });
    });

    return { ok: true, httpStatus: response.status, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 21. 社團法人中華民國保護動物協會 (APA Taiwan)
// ---------------------------------------------------------------------------
export async function fetchApatwNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "apatw_news";
  const sourceName = "apatw";
  const feedName = "社團法人中華民國保護動物協會";
  const baseUrl = "https://www.apatw.org";

  try {
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();
    let lastHttpStatus = 200;

    // Crawl first 4 pages (pages 0 to 3, yielding ~16 articles)
    for (let page = 0; page < 4; page++) {
      const pageUrl = page === 0 ? `${baseUrl}/news` : `${baseUrl}/news?page=${page}`;
      const response = await httpGetText(pageUrl, {
        headers: DEFAULT_HEADERS,
        timeoutMs: 15_000,
      });

      lastHttpStatus = response.status;
      if (response.status < 200 || response.status >= 300) {
        if (page === 0) {
          return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
        }
        break;
      }

      const $ = load(response.text);
      const rows = $(".views-row").toArray();
      if (rows.length === 0) break;

      for (const el of rows) {
        const anchor = $(el).find("h2.title a");
        const href = anchor.attr("href");
        const title = anchor.text().trim().replace(/\s+/g, " ");
        if (!href || !title) continue;

        const canonicalUrl = toAbsoluteUrl(href, baseUrl);
        if (seen.has(canonicalUrl)) continue;
        seen.add(canonicalUrl);

        // Date extraction: "日期：2026-09-11"
        const textContent = $(el).text();
        const dateMatch = textContent.match(/日期[：:]\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
        const publishedAtUtc = dateMatch ? parseYmdToUtc(dateMatch[1]) : new Date();

        // Summary extraction: .intro-text
        const introText = $(el).find(".intro-text").text().trim().replace(/\s+/g, " ");
        const description = introText || title;

        // Image extraction: .rep-img img
        const rawImg = $(el).find(".rep-img img").attr("src");
        const assets: NewsAsset[] = [];
        if (rawImg) {
          const fullImg = toAbsoluteUrl(rawImg, baseUrl);
          const localPath = await downloadArticleImage(fullImg).catch(() => null);
          assets.push({
            assetType: "image",
            title: null,
            url: localPath || fullImg,
            sortOrder: 0,
          });
        }

        // Semantic category tagging
        let categoryRaw = "動物保護";
        if (/活動|講座|論壇|志工|參觀|開放日|營隊|義賣/.test(title)) {
          categoryRaw = "動保活動";
        } else if (/照護|健康|醫療|疾病|癱瘓|飲食|結紮|疫苗|領養|認養/.test(title)) {
          categoryRaw = "毛孩照護";
        }

        const externalId = canonicalUrl.match(/\/news\/(\d+)/)?.[1] || sha256(canonicalUrl).slice(0, 16);
        const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, publishedAtUtc }));

        items.push({
          sourceName,
          feedCode,
          feedName,
          externalId,
          canonicalUrl,
          sourceUrl: canonicalUrl,
          title,
          descriptionHtml: description,
          descriptionText: description,
          detailHtml: null,
          detailText: null,
          deptName: null,
          categoryRaw,
          displayType: null,
          publishedAtUtc,
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
    }

    return { ok: true, httpStatus: lastHttpStatus, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// 24. 社企流 (Social Enterprise Insights)
// ---------------------------------------------------------------------------
export async function fetchSeinsightsNews(): Promise<NpoFetchResult> {
  const feedCode: FeedCode = "seinsights_news";
  const sourceName = "seinsights";
  const feedName = "社企流";
  const baseUrl = "https://www.seinsights.asia";

  try {
    const items: EnrichedRssItem[] = [];
    const seen = new Set<string>();
    let lastHttpStatus = 200;

    // Fetch pages 1 to 3 (10 articles per page, ~30 articles total)
    for (let page = 1; page <= 3; page++) {
      const pageUrl = page === 1 ? `${baseUrl}/section` : `${baseUrl}/section?page=${page}`;
      const response = await httpGetText(pageUrl, {
        headers: DEFAULT_HEADERS,
        timeoutMs: 15_000,
      });

      lastHttpStatus = response.status;
      if (response.status < 200 || response.status >= 300) {
        if (page === 1) {
          return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: `HTTP ${response.status}` };
        }
        break;
      }

      const text = response.text;
      const startTag = '<script id="__NEXT_DATA__" type="application/json">';
      const startIndex = text.indexOf(startTag);
      if (startIndex === -1) {
        if (page === 1) {
          return { ok: false, httpStatus: response.status, itemCount: 0, items: [], errorMessage: "Missing __NEXT_DATA__ in page" };
        }
        break;
      }

      const endIndex = text.indexOf("</script>", startIndex);
      if (endIndex === -1) break;

      const jsonStr = text.slice(startIndex + startTag.length, endIndex);
      let parsedData: any;
      try {
        parsedData = JSON.parse(jsonStr);
      } catch {
        break;
      }

      const posts = parsedData?.props?.pageProps?.sectionObj?.posts || [];
      if (!Array.isArray(posts) || posts.length === 0) break;

      for (const post of posts) {
        if (!post?.id || !post?.title) continue;
        const canonicalUrl = `${baseUrl}/article/${post.id}`;
        if (seen.has(canonicalUrl)) continue;
        seen.add(canonicalUrl);

        const title = String(post.title).trim();
        const publishedAtUtc = post.publishDate ? new Date(post.publishDate) : new Date();

        // Extract section and category tags
        const tags: string[] = [];
        if (Array.isArray(post.section)) {
          for (const sec of post.section) {
            if (sec?.name) tags.push(String(sec.name).trim());
          }
        }
        if (Array.isArray(post.category)) {
          for (const cat of post.category) {
            if (cat?.name) tags.push(String(cat.name).trim());
          }
        }
        const categoryRaw = tags.length > 0 ? tags.join("、") : "社會創新";

        // Summary / Description: heroCaption or title
        const description = (post.heroCaption ? String(post.heroCaption).trim() : "") || title;

        // Image extraction: heroImage.resized.w800 or original
        const rawImg = post.heroImage?.resized?.w800 || post.heroImage?.resized?.original || null;
        const assets: NewsAsset[] = [];
        if (rawImg) {
          const localPath = await downloadArticleImage(rawImg).catch(() => null);
          assets.push({
            assetType: "image",
            title: null,
            url: localPath || rawImg,
            sortOrder: 0,
          });
        }

        const externalId = `seinsights_${post.id}`;
        const payloadHash = sha256(JSON.stringify({ title, canonicalUrl, publishedAtUtc }));

        items.push({
          sourceName,
          feedCode,
          feedName,
          externalId,
          canonicalUrl,
          sourceUrl: canonicalUrl,
          title,
          descriptionHtml: description,
          descriptionText: description,
          detailHtml: null,
          detailText: null,
          deptName: null,
          categoryRaw,
          displayType: null,
          publishedAtUtc,
          publicBeginAtTaipei: null,
          publicEndAtTaipei: null,
          payloadHash,
          assets,
          metaTitle: "",
          metaDescription: "",
          keywords: tags.join(","),
          geoSummary: "",
        });
      }
    }

    return { ok: true, httpStatus: lastHttpStatus, itemCount: items.length, items, errorMessage: null };
  } catch (error: any) {
    return { ok: false, httpStatus: null, itemCount: 0, items: [], errorMessage: error.message || "Unknown error" };
  }
}



