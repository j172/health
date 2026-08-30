import { NextResponse } from "next/server";
import { fetchGovData } from "@/lib/server/http/govFetch";

export const dynamic = "force-dynamic";
export const revalidate = 3600; // 1 hour cache

export interface CulturalShowInfo {
  time: string;
  location: string;
  locationName: string;
  onSales?: string;
  price?: string;
  latitude?: number | null;
  longitude?: number | null;
  endTime?: string;
}

export interface CulturalActivityItem {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  description: string;
  imageUrl?: string | null;
  masterUnit?: string | null;
  startDate: string;
  endDate: string;
  sourceWebPromote?: string | null;
  webSales?: string | null;
  shows: CulturalShowInfo[];
}

export const CATEGORY_LABELS: Record<string, string> = {
  "1": "🎵 音樂表演",
  "2": "🎭 戲劇演出",
  "3": "💃 舞蹈表演",
  "4": "🎨 親子活動",
  "6": "🖼️ 藝文展覽",
  "7": "🎤 講座工作坊",
  "8": "🎬 電影與沉浸",
  "17": "✨ 綜藝節慶",
};

const ALL_CATEGORIES = ["6", "1", "2", "3", "4", "7", "8"];

function toSafeString(v: any): string {
  if (!v) return "";
  if (Array.isArray(v)) return v.map(toSafeString).filter(Boolean).join("、");
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

let cachedShows: { timestamp: number; items: CulturalActivityItem[] } | null = null;
const CACHE_TTL_MS = 3600 * 1000; // 1 hour

const CULTURE_BASE_URL =
  "https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ";

async function fetchCategoryData(cat: string): Promise<any[]> {
  try {
    const res = await fetchGovData(`${CULTURE_BASE_URL}&category=${cat}`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.warn(`[Culture API] category ${cat} fetch error:`, err);
  }
  return [];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get("category") || "all";
    const keyword = (searchParams.get("keyword") || "").trim().toLowerCase();
    const city = (searchParams.get("city") || "").trim();

    const now = Date.now();

    if (!cachedShows || now - cachedShows.timestamp > CACHE_TTL_MS) {
      try {
        const rawResults = await Promise.all(ALL_CATEGORIES.map((c) => fetchCategoryData(c)));
        const flatList = rawResults.flat();

        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
        const seenIds = new Set<string>();

        const parsedItems: CulturalActivityItem[] = [];

        for (const item of flatList) {
          const uid = toSafeString(item.UID);
          const title = toSafeString(item.title);
          const endDate = toSafeString(item.endDate);

          if (!title) continue;
          if (endDate && endDate < todayStr) continue;
          if (uid && seenIds.has(uid)) continue;
          if (uid) seenIds.add(uid);

          const cat = toSafeString(item.category) || "6";
          const catLabel = CATEGORY_LABELS[cat] || "🎨 藝文活動";

          const shows: CulturalShowInfo[] = (item.showInfo || []).map((s: any) => ({
            time: toSafeString(s.time),
            location: toSafeString(s.location),
            locationName: toSafeString(s.locationName),
            onSales: toSafeString(s.onSales) || "N",
            price: toSafeString(s.price),
            latitude: s.latitude ? parseFloat(String(s.latitude)) : null,
            longitude: s.longitude ? parseFloat(String(s.longitude)) : null,
            endTime: toSafeString(s.endTime),
          }));

          const master = toSafeString(item.masterUnit || item.showUnit);

          parsedItems.push({
            id: uid || String(Math.random()),
            title,
            category: cat,
            categoryLabel: catLabel,
            description: toSafeString(item.descriptionFilterHtml || item.comment),
            imageUrl: toSafeString(item.imageUrl) || null,
            masterUnit: master || null,
            startDate: toSafeString(item.startDate),
            endDate: toSafeString(item.endDate),
            sourceWebPromote: toSafeString(item.sourceWebPromote) || null,
            webSales: toSafeString(item.webSales) || null,
            shows,
          });
        }

        // Sort by start date ascending (recent/upcoming first)
        parsedItems.sort((a, b) => {
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return a.startDate.localeCompare(b.startDate);
        });

        cachedShows = { timestamp: now, items: parsedItems };
      } catch (fetchErr) {
        console.error("Culture API all categories fetch error:", fetchErr);
      }
    }

    let items = cachedShows ? [...cachedShows.items] : [];

    if (categoryParam !== "all") {
      items = items.filter((i) => i.category === categoryParam);
    }

    if (keyword) {
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(keyword) ||
          i.description.toLowerCase().includes(keyword) ||
          (i.masterUnit && i.masterUnit.toLowerCase().includes(keyword)) ||
          i.shows.some(
            (s) =>
              s.location.toLowerCase().includes(keyword) ||
              s.locationName.toLowerCase().includes(keyword)
          )
      );
    }

    if (city && city !== "全部縣市") {
      items = items.filter((i) =>
        i.shows.some(
          (s) => s.location.includes(city) || s.locationName.includes(city)
        )
      );
    }

    return NextResponse.json({
      ok: true,
      count: items.length,
      items,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Cultural shows API error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch cultural shows" },
      { status: 500 }
    );
  }
}
