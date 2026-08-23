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
  description: string;
  imageUrl?: string | null;
  masterUnit?: string | null;
  startDate: string;
  endDate: string;
  sourceWebPromote?: string | null;
  webSales?: string | null;
  shows: CulturalShowInfo[];
}

function toSafeString(v: any): string {
  if (!v) return "";
  if (Array.isArray(v)) return v.map(toSafeString).filter(Boolean).join("、");
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

let cachedShows: { timestamp: number; items: CulturalActivityItem[] } | null = null;
const CACHE_TTL_MS = 3600 * 1000; // 1 hour

const CULTURE_API_URL =
  "https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category=4";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = (searchParams.get("keyword") || "").trim().toLowerCase();
    const city = (searchParams.get("city") || "").trim();

    const now = Date.now();
    let rawList: any[] = [];

    if (!cachedShows || now - cachedShows.timestamp > CACHE_TTL_MS) {
      try {
        const res = await fetchGovData(CULTURE_API_URL);
        if (res.ok) {
          rawList = await res.json();
        }
      } catch (fetchErr) {
        console.warn("Culture API fetch error, checking cache fallback:", fetchErr);
      }
    }

    if (Array.isArray(rawList) && rawList.length > 0) {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
      const parsedItems: CulturalActivityItem[] = rawList
        .filter((item) => {
          const title = toSafeString(item.title);
          const endDate = toSafeString(item.endDate);
          if (!title) return false;
          if (endDate && endDate < todayStr) return false;
          return true;
        })
        .map((item) => {
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

          return {
            id: toSafeString(item.UID) || String(Math.random()),
            title: toSafeString(item.title),
            category: toSafeString(item.category) || "4",
            description: toSafeString(item.descriptionFilterHtml || item.comment),
            imageUrl: toSafeString(item.imageUrl) || null,
            masterUnit: master || null,
            startDate: toSafeString(item.startDate),
            endDate: toSafeString(item.endDate),
            sourceWebPromote: toSafeString(item.sourceWebPromote) || null,
            webSales: toSafeString(item.webSales) || null,
            shows,
          };
        });

      cachedShows = { timestamp: now, items: parsedItems };
    }

    let items = cachedShows ? [...cachedShows.items] : [];

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

    if (city) {
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
