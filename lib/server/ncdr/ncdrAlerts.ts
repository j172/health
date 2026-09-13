import "server-only";
import { httpGetJson } from "@/lib/server/net/httpClient";

export interface NcdrRawEntry {
  id: string;
  title: string;
  updated: string;
  author: { name: string };
  link?: { "@href"?: string };
  summary?: { "@type"?: string; "#text"?: string } | string;
  category?: { "@term"?: string };
  status?: string;
  msgType?: string;
  effective?: string;
  expires?: string;
}

export interface NcdrFeedResponse {
  id: string;
  title: string;
  updated: string;
  entry?: NcdrRawEntry[];
}

export type AlertSeverity = "critical" | "warning" | "info";

export interface NcdrAlert {
  id: string;
  title: string;
  category: string;
  author: string;
  summary: string;
  effective: string;
  expires: string;
  severity: AlertSeverity;
  counties: string[];
  capUrl?: string;
}

const NCDR_FEED_URL = "https://alerts.ncdr.nat.gov.tw/JSONAtomFeeds.ashx";

const TAIWAN_COUNTIES = [
  "臺北市", "台北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
  "臺中市", "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "臺南市",
  "台南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "台東縣", "澎湖縣",
  "金門縣", "連江縣",
];

// 快取 3 分鐘，避免頻繁呼叫 NCDR
let cachedAlerts: NcdrAlert[] = [];
let lastFetchedAt = 0;
const CACHE_TTL_MS = 180_000;

function extractCounties(text: string): string[] {
  const found = new Set<string>();
  for (const c of TAIWAN_COUNTIES) {
    if (text.includes(c)) {
      // 統一轉為正體「臺」
      const normalized = c.replace("台", "臺");
      found.add(normalized);
    }
  }
  return Array.from(found);
}

function determineSeverity(category: string, summary: string): AlertSeverity {
  if (category === "淹水" || category === "土石流" || category === "海嘯" || category === "地震") {
    return "critical";
  }
  if (summary.includes("紅色警戒") || summary.includes("緊急搶修") || summary.includes("一級警戒")) {
    return "critical";
  }
  if (category === "停水" || category === "停電" || category === "降雨" || category === "道路封閉") {
    return "warning";
  }
  return "info";
}

/**
 * 取得 NCDR 全台即時重大災防示警（已過濾民生關鍵警訊）
 */
export async function getActiveNcdrAlerts(options?: {
  county?: string;
  category?: string;
}): Promise<NcdrAlert[]> {
  const now = Date.now();
  if (cachedAlerts.length > 0 && now - lastFetchedAt < CACHE_TTL_MS) {
    return filterAlerts(cachedAlerts, options);
  }

  try {
    const res = await httpGetJson<NcdrFeedResponse>(NCDR_FEED_URL, { timeoutMs: 10000 });
    if (res.status === 200 && res.data && Array.isArray(res.data.entry)) {
      const parsed: NcdrAlert[] = [];
      const nowTime = new Date().getTime();

      for (const e of res.data.entry) {
        const category = e.category?.["@term"] || e.title || "一般示警";

        // 僅保留與民生健康防災直接相關的重大災害類別
        const targetCategories = ["停水", "停電", "淹水", "降雨", "土石流", "道路封閉", "海嘯", "地震", "風災", "高溫"];
        const isTargetCategory = targetCategories.some((tc) => category.includes(tc));
        if (!isTargetCategory) continue;

        let summaryText = "";
        if (typeof e.summary === "string") {
          summaryText = e.summary;
        } else if (e.summary && typeof e.summary === "object") {
          summaryText = e.summary["#text"] || "";
        }

        const effective = e.effective || e.updated || "";
        const expires = e.expires || "";

        // 檢查是否已過期 (如果 expires 存在)
        if (expires) {
          const expTime = new Date(expires.replace(/上午|下午/g, "")).getTime();
          if (!isNaN(expTime) && expTime < nowTime) {
            continue;
          }
        }

        const counties = extractCounties(`${e.title} ${summaryText}`);
        const severity = determineSeverity(category, summaryText);

        parsed.push({
          id: e.id,
          title: e.title,
          category,
          author: e.author?.name || "政府應變單位",
          summary: summaryText.trim(),
          effective,
          expires,
          severity,
          counties,
          capUrl: e.link?.["@href"],
        });
      }

      cachedAlerts = parsed;
      lastFetchedAt = now;
      return filterAlerts(cachedAlerts, options);
    }
  } catch (err) {
    console.warn("NCDR feed fetch failed:", err instanceof Error ? err.message : String(err));
  }

  return filterAlerts(cachedAlerts, options);
}

function filterAlerts(
  alerts: NcdrAlert[],
  options?: { county?: string; category?: string }
): NcdrAlert[] {
  let result = [...alerts];
  if (options?.county) {
    const target = options.county.replace("台", "臺");
    result = result.filter(
      (a) => a.counties.length === 0 || a.counties.includes(target)
    );
  }
  if (options?.category) {
    result = result.filter((a) => a.category.includes(options.category!));
  }
  return result;
}
