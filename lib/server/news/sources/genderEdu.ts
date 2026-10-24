import { load } from "cheerio";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256 } from "@/lib/server/rss/scraperUtils";

export const GENDER_EDU_URL = "https://www.gender.edu.tw/web/index.php/m1/m1_03_index";
export const GENDER_EDU_SOURCE_NAME = "gender_edu";
export const GENDER_EDU_FEED_CODE = "gender_edu_clarify" as const;
export const GENDER_EDU_FEED_NAME = "教育部性平網－新聞稿及資訊澄清";
export const GENDER_EDU_DEPT_NAME = "教育部性別平等教育全球資訊網";

/**
 * Keywords identifying administrative memos, committee rosters, and non-debunking filings
 * from m1_01_index or administrative postings that should be filtered out.
 */
const ADMINISTRATIVE_MEMO_REGEX =
  /(?:遴選|研習營|培訓|徵件|委員名單|公文|函知|開會通知|核定名單|投標|評選|甄選|報名簡章|表揚)/;

/**
 * Keywords indicating high-value clarification, rumor debunking, and policy guidance.
 */
const DEBUNKING_KEYWORDS =
  /(?:澄清|闢謠|不實|謠言|假訊息|假消息|假新聞|爭議說明|外界關切|媒體報導.*說明)/;

/**
 * Filters out purely administrative memo filings, committee nominations,
 * and internal announcements while retaining debunking, rumor clarification, and policy explanations.
 */
export function isAdministrativeMemo(title: string): boolean {
  if (!title) return true;
  const trimmed = title.trim();

  // If title explicitly states it is a clarification or debunking, retain it
  if (DEBUNKING_KEYWORDS.test(trimmed)) {
    return false;
  }

  // If title matches administrative memo patterns
  if (ADMINISTRATIVE_MEMO_REGEX.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Parses date string in either Gregorian (e.g. 2026-10-24, 2026/10/24)
 * or Republic of China (ROC) calendar format (e.g. 115-10-24, 115/10/24, 115.10.24).
 */
export function parseGenderEduDate(raw: string): Date | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();

  // Match Gregorian date: 2026-10-24, 2026/10/24, 2026.10.24
  const gregorianMatch = s.match(/(20\d{2})[./\-](\d{1,2})[./\-](\d{1,2})/);
  if (gregorianMatch) {
    const year = gregorianMatch[1];
    const month = gregorianMatch[2].padStart(2, "0");
    const day = gregorianMatch[3].padStart(2, "0");
    return parseTaipeiDateToUtc(`${year}-${month}-${day} 08:00:00`);
  }

  // Match ROC date: 110-10-24, 115/10/24, 115.10.24 (year <= 150)
  const rocMatch = s.match(/(\d{2,3})[./\-](\d{1,2})[./\-](\d{1,2})/);
  if (rocMatch) {
    const rocYear = parseInt(rocMatch[1], 10);
    if (rocYear >= 90 && rocYear <= 150) {
      const year = rocYear + 1911;
      const month = rocMatch[2].padStart(2, "0");
      const day = rocMatch[3].padStart(2, "0");
      return parseTaipeiDateToUtc(`${year}-${month}-${day} 08:00:00`);
    }
  }

  return null;
}

/**
 * Pure parser for gender.edu.tw m1_03_index (News and Clarification) HTML.
 */
export function parseGenderEduHtml(
  html: string,
  baseUrl = "https://www.gender.edu.tw",
): EnrichedRssItem[] {
  if (!html || typeof html !== "string" || !html.trim()) {
    return [];
  }

  const $ = load(html);
  const items: EnrichedRssItem[] = [];
  const seenUrls = new Set<string>();

  // Look for table rows or list items in the page
  const selectors = [
    "table.table tr",
    "table tr",
    ".list-group-item",
    ".news-item",
    ".list-item",
    "ul.list li",
    "div.list_item",
    "div.data_table_row",
  ];

  const matchedElements = $(selectors.join(", "));

  matchedElements.each((_, el) => {
    // Skip header rows
    if ($(el).find("th").length > 0) return;

    // Locate anchor tag
    const anchor = $(el).find("a").first();
    if (!anchor.length) return;

    let href = anchor.attr("href")?.trim();
    if (!href || href === "#" || href.startsWith("javascript:")) return;

    if (!href.startsWith("http")) {
      if (href.startsWith("/")) {
        href = `${baseUrl}${href}`;
      } else {
        href = `${baseUrl}/${href.replace(/^\.\//, "")}`;
      }
    }

    if (seenUrls.has(href)) return;

    // Title extraction
    let title = (anchor.attr("title") || anchor.text() || "").trim();
    title = title.replace(/\s+/g, " ");
    if (!title || title.length < 3) return;

    // Filter out purely administrative memos
    if (isAdministrativeMemo(title)) {
      return;
    }

    seenUrls.add(href);

    // Date extraction from the container text or sibling cells
    const fullRowText = $(el).text();
    const publishedAtUtc = parseGenderEduDate(fullRowText) || new Date();

    // Summary / description
    const summaryCandidate =
      $(el).find(".summary, .desc, .content, p, td:nth-child(3)").text().trim() || title;
    const descriptionText = summaryCandidate.replace(/\s+/g, " ").slice(0, 500);

    // Image extraction if present
    const imgEl = $(el).find("img").first();
    let leadImageUrl: string | null = null;
    if (imgEl.length) {
      const src = imgEl.attr("src")?.trim();
      if (src && !src.includes("icon") && !src.includes("arrow")) {
        leadImageUrl = src.startsWith("http") ? src : `${baseUrl}/${src.replace(/^\//, "")}`;
      }
    }

    const payloadHash = sha256(`${title}::${href}`);
    const externalIdMatch = href.match(/(?:sid|id|sn)=(\d+)/i) || href.match(/\/(\d+)(?:\.html|\/|$)/);
    const externalId = externalIdMatch ? `gender_edu_${externalIdMatch[1]}` : `gender_edu_${payloadHash.slice(0, 16)}`;

    items.push({
      sourceName: GENDER_EDU_SOURCE_NAME,
      feedCode: GENDER_EDU_FEED_CODE,
      feedName: GENDER_EDU_FEED_NAME,
      externalId,
      canonicalUrl: href,
      sourceUrl: href,
      title,
      descriptionHtml: `<p>${descriptionText}</p>`,
      descriptionText,
      deptName: GENDER_EDU_DEPT_NAME,
      categoryRaw: "factcheck",
      displayType: "gov_clarification",
      publishedAtUtc,
      publicBeginAtTaipei: publishedAtUtc,
      publicEndAtTaipei: null,
      payloadHash,
      leadImageUrl,
      detailHtml: null,
      detailText: null,
      assets: leadImageUrl
        ? [{ assetType: "image", title, url: leadImageUrl, sortOrder: 0 }]
        : [],
      metaTitle: title,
      metaDescription: descriptionText,
      keywords: "性別平等,事實查核,資訊澄清,教育部",
      geoSummary: "",
    });
  });

  return items;
}

/**
 * Fetches and extracts gender equality news clarifications.
 */
export async function fetchGenderEduNews(): Promise<EnrichedRssItem[]> {
  try {
    const { status, text } = await httpGetText(GENDER_EDU_URL, {
      timeout: 8_000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (status >= 200 && status < 300 && text) {
      return parseGenderEduHtml(text);
    }
  } catch (err) {
    console.error("[genderEdu] Failed to fetch gender.edu.tw news:", err);
  }

  return [];
}
