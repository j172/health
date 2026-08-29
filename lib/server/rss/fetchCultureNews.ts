import { createHash } from "crypto";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";

const SOURCE_NAME = "culture_tw";
const FEED_NAME = "文化部－藝文展覽與活動";
const FEED_CODE = "moc_shows" as const;

const CATEGORIES = ["6", "3", "8", "17", "1", "7"];
const CULTURE_BASE_URL = "https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ";
const PUBLIC_ART_URL = "https://publicartap.moc.gov.tw/data/api/artWork/openData";

const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

interface CultureShowItem {
  UID?: string;
  title?: string;
  category?: string;
  showInfo?: Array<{
    time?: string;
    location?: string;
    locationName?: string;
    latitude?: string;
    longitude?: string;
  }>;
  showUnit?: string;
  descriptionFilterHtml?: string;
  imageUrl?: string;
  webSales?: string;
  startDate?: string;
  endDate?: string;
  editModifyDate?: string;
}

export interface CultureNewsFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchCultureNews = async (): Promise<CultureNewsFetchResult> => {
  const items: EnrichedRssItem[] = [];
  const seenIds = new Set<string>();

  try {
    for (const cat of CATEGORIES) {
      try {
        const url = `${CULTURE_BASE_URL}&category=${cat}`;
        const { status, text } = await httpGetText(url, {
          timeoutMs: 12_000,
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (Healthz-CultureSync/1.0)",
          },
        });

        if (status >= 200 && status < 300 && text) {
          const shows = JSON.parse(text) as CultureShowItem[];
          if (Array.isArray(shows)) {
            // Take recent / upcoming shows
            for (const show of shows.slice(0, 15)) {
              const uid = str(show.UID);
              if (!uid || seenIds.has(uid)) continue;
              seenIds.add(uid);

              const title = str(show.title);
              if (!title) continue;

              const showInfo = show.showInfo?.[0];
              const location = showInfo?.locationName || showInfo?.location || "";
              const lat = Number(showInfo?.latitude);
              const lng = Number(showInfo?.longitude);

              const desc = str(show.descriptionFilterHtml) || `展演地點：${location}`;
              const publishedAtUtc = show.editModifyDate
                ? parseTaipeiDateToUtc(show.editModifyDate) || new Date()
                : new Date();

              const canonicalUrl = show.webSales || `https://cloud.culture.tw/frontsite/inquiry/eventInquiryAction.do?method=showEventDetail&uid=${uid}`;

              const payloadHash = sha256(
                JSON.stringify({
                  uid,
                  title,
                  location,
                  publishedAtUtc: publishedAtUtc.toISOString(),
                }),
              );

              items.push({
                sourceName: SOURCE_NAME,
                feedCode: FEED_CODE,
                feedName: show.category === "17" ? "全國親子藝文活動" : FEED_NAME,
                externalId: uid,
                canonicalUrl,
                sourceUrl: canonicalUrl,
                title,
                descriptionHtml: desc,
                descriptionText: desc,
                detailHtml: desc,
                detailText: desc,
                deptName: show.showUnit || "文化部",
                categoryRaw: "藝文展覽",
                displayType: null,
                publishedAtUtc,
                publicBeginAtTaipei: show.startDate ? parseTaipeiDateToUtc(show.startDate) : null,
                publicEndAtTaipei: show.endDate ? parseTaipeiDateToUtc(show.endDate) : null,
                payloadHash,
                assets: show.imageUrl
                  ? [
                      {
                        assetType: "image",
                        url: show.imageUrl,
                        title: title,
                        sortOrder: 0,
                      },
                    ]
                  : [],
                metaTitle: "",
                metaDescription: "",
                keywords: "",
                geoSummary: location,
              });
            }
          }
        }
      } catch (catErr) {
        console.warn(`[fetchCultureNews] category ${cat} warning:`, catErr);
      }
    }

    return {
      ok: true,
      httpStatus: 200,
      itemCount: items.length,
      items,
      errorMessage: null,
    };
  } catch (err) {
    console.error("[fetchCultureNews] Failed:", err);
    return {
      ok: false,
      httpStatus: 500,
      itemCount: 0,
      items: [],
      errorMessage: String(err),
    };
  }
};
