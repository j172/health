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

const CULTURE_API_URL =
  "https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category=4";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = (searchParams.get("keyword") || "").trim().toLowerCase();
    const city = (searchParams.get("city") || "").trim();

    const res = await fetchGovData(CULTURE_API_URL);

    if (!res.ok) {
      throw new Error(`Culture API error: HTTP ${res.status}`);
    }

    const rawList = await res.json();
    if (!Array.isArray(rawList)) {
      return NextResponse.json({ ok: true, count: 0, items: [] });
    }

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "/");

    let items: CulturalActivityItem[] = rawList
      .filter((item) => {
        if (!item.title) return false;
        if (item.endDate && item.endDate < todayStr) return false;
        return true;
      })
      .map((item) => {
        const shows: CulturalShowInfo[] = (item.showInfo || []).map((s: any) => ({
          time: s.time || "",
          location: s.location || "",
          locationName: s.locationName || "",
          onSales: s.onSales || "N",
          price: s.price || "",
          latitude: s.latitude ? parseFloat(s.latitude) : null,
          longitude: s.longitude ? parseFloat(s.longitude) : null,
          endTime: s.endTime || "",
        }));

        return {
          id: item.UID || String(Math.random()),
          title: (item.title || "").trim(),
          category: item.category || "4",
          description: (item.descriptionFilterHtml || item.comment || "").trim(),
          imageUrl: item.imageUrl || null,
          masterUnit: (item.masterUnit || item.showUnit || "").trim() || null,
          startDate: item.startDate || "",
          endDate: item.endDate || "",
          sourceWebPromote: item.sourceWebPromote || null,
          webSales: item.webSales || null,
          shows,
        };
      });

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
