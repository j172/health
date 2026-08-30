import { NextResponse } from "next/server";
import { fetchGovData } from "@/lib/server/http/govFetch";

export const dynamic = "force-dynamic";
export const revalidate = 43200; // 12 hours cache

export interface PublicArtItem {
  id: string;
  artNo: string;
  title: string;
  artist: string;
  dimensions?: string | null;
  material?: string | null;
  city: string;
  location: string;
  lat: number | null;
  lng: number | null;
  fieldType?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  year?: string | null;
  sourceUrl?: string | null;
  agency?: string | null;
  distanceKm?: number;
}

const PUBLIC_ART_API_URL = "https://publicartap.moc.gov.tw/data/api/artWork/openData";

let cachedArtworks: { timestamp: number; items: PublicArtItem[] } | null = null;
const CACHE_TTL_MS = 12 * 3600 * 1000; // 12 hours

function toSafeString(v: any): string {
  if (!v) return "";
  if (Array.isArray(v)) return v.map(toSafeString).filter(Boolean).join("、");
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = (searchParams.get("keyword") || "").trim().toLowerCase();
    const city = (searchParams.get("city") || "").trim();
    const latParam = searchParams.get("lat");
    const lngParam = searchParams.get("lng");
    const radiusKm = parseFloat(searchParams.get("radius") || "50");

    const userLat = latParam ? parseFloat(latParam) : null;
    const userLng = lngParam ? parseFloat(lngParam) : null;

    const now = Date.now();

    if (!cachedArtworks || now - cachedArtworks.timestamp > CACHE_TTL_MS) {
      try {
        const res = await fetchGovData(PUBLIC_ART_API_URL);
        if (res.ok) {
          const rawList = await res.json();
          if (Array.isArray(rawList)) {
            const parsed: PublicArtItem[] = rawList
              .map((item: any) => {
                const title = toSafeString(item["作品名稱"]);
                if (!title) return null;

                const latStr = toSafeString(item["緯度"]);
                const lngStr = toSafeString(item["經度"]);
                const lat = latStr ? parseFloat(latStr) : null;
                const lng = lngStr ? parseFloat(lngStr) : null;

                return {
                  id: toSafeString(item["系統編號"]) || toSafeString(item["作品編號"]) || String(Math.random()),
                  artNo: toSafeString(item["作品編號"]),
                  title,
                  artist: toSafeString(item["作者"]) || "未提供作者",
                  dimensions: toSafeString(item["作品尺寸"]) || null,
                  material: toSafeString(item["作品材質"]) || null,
                  city: toSafeString(item["縣市"]),
                  location: toSafeString(item["設置地點"]),
                  lat: lat && !isNaN(lat) ? lat : null,
                  lng: lng && !isNaN(lng) ? lng : null,
                  fieldType: toSafeString(item["場域"]) || null,
                  description: toSafeString(item["作品說明"]) || null,
                  imageUrl: toSafeString(item["主圖"]) || null,
                  year: toSafeString(item["創作年代yyyy"]) || null,
                  sourceUrl: toSafeString(item["來源網站"]) || null,
                  agency: toSafeString(item["委託單位"]) || null,
                };
              })
              .filter(Boolean) as PublicArtItem[];

            cachedArtworks = { timestamp: now, items: parsed };
          }
        }
      } catch (fetchErr) {
        console.error("Public art API fetch error:", fetchErr);
      }
    }

    let items = cachedArtworks ? [...cachedArtworks.items] : [];

    if (keyword) {
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(keyword) ||
          i.artist.toLowerCase().includes(keyword) ||
          i.location.toLowerCase().includes(keyword) ||
          (i.description && i.description.toLowerCase().includes(keyword)) ||
          (i.fieldType && i.fieldType.toLowerCase().includes(keyword)) ||
          (i.agency && i.agency.toLowerCase().includes(keyword))
      );
    }

    if (city && city !== "全部縣市") {
      items = items.filter((i) => i.city.includes(city) || i.location.includes(city));
    }

    if (userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng)) {
      items = items
        .map((i) => {
          if (i.lat !== null && i.lng !== null) {
            const dist = haversineDistanceKm(userLat, userLng, i.lat, i.lng);
            return { ...i, distanceKm: Math.round(dist * 10) / 10 };
          }
          return i;
        })
        .filter((i) => i.distanceKm === undefined || i.distanceKm <= radiusKm)
        .sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));
    }

    return NextResponse.json({
      ok: true,
      count: items.length,
      items: items.slice(0, 200), // Return top 200 results for performance
      totalMatched: items.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Public art API error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch public art" },
      { status: 500 }
    );
  }
}
