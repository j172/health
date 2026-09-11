import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { countFacilities, searchFacilities } from "@/lib/server/facilities/queries";

import tourismFactorySeed from "@/data/facilities-seeds/tourism_factory.json";
import bookstoreSeed from "@/data/facilities-seeds/bookstore.json";

export const runtime = "nodejs";

interface SeedFacilityItem {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  service_item: string | null;
  extra_json?: any;
  distance_km?: number;
}

const SEED_FACILITIES: Record<string, SeedFacilityItem[]> = {
  tourism_factory: tourismFactorySeed as unknown as SeedFacilityItem[],
  bookstore: bookstoreSeed as unknown as SeedFacilityItem[],
};

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

function getFacilitySeedFallback(
  facilityType: string,
  options: {
    keyword?: string;
    lat?: number;
    lng?: number;
    radiusMeters?: number;
    serviceItem?: string;
    onlyCharity?: boolean;
    sort?: string;
    limit?: number;
  },
): { facilities: SeedFacilityItem[]; total: number } | null {
  try {
    let raw = SEED_FACILITIES[facilityType];
    if (!raw) {
      const seedPath = path.join(process.cwd(), "data", "facilities-seeds", `${facilityType}.json`);
      if (fs.existsSync(seedPath)) {
        raw = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as SeedFacilityItem[];
      }
    }
    if (!raw || raw.length === 0) return null;

    const totalAll = raw.length;
    let list = raw.map((item) => ({ ...item }));

    // 1. Keyword filter
    if (options.keyword) {
      const kw = options.keyword.toLowerCase().trim().replace(/臺/g, "台");
      list = list.filter((item) => {
        const n = (item.name || "").toLowerCase().replace(/臺/g, "台");
        const a = (item.address || "").toLowerCase().replace(/臺/g, "台");
        const s = (item.service_item || "").toLowerCase().replace(/臺/g, "台");
        return n.includes(kw) || a.includes(kw) || s.includes(kw);
      });
    }

    // 2. Category / serviceItem filter
    if (options.serviceItem) {
      const cat = options.serviceItem.trim();
      list = list.filter((item) => item.service_item && item.service_item.includes(cat));
    }

    // 3. Charity filter
    if (options.onlyCharity) {
      list = list.filter((item) => item.extra_json?.charityUrl);
    }

    // 4. GPS Distance calculation & radius filter
    if (
      options.lat !== undefined &&
      options.lng !== undefined &&
      Number.isFinite(options.lat) &&
      Number.isFinite(options.lng)
    ) {
      const uLat = options.lat;
      const uLng = options.lng;
      const radiusKm = options.radiusMeters ? options.radiusMeters / 1000 : undefined;

      list = list.map((item) => {
        if (item.lat != null && item.lng != null) {
          const dist = haversineDistanceKm(uLat, uLng, item.lat, item.lng);
          return { ...item, distance_km: dist };
        }
        return item;
      });

      if (radiusKm !== undefined) {
        list = list.filter((item) => item.distance_km !== undefined && item.distance_km <= radiusKm);
      }

      if (!options.sort || options.sort === "distance") {
        list.sort((a, b) => {
          if (a.distance_km == null && b.distance_km == null) return 0;
          if (a.distance_km == null) return 1;
          if (b.distance_km == null) return -1;
          return a.distance_km - b.distance_km;
        });
      }
    }

    // 5. Explicit name or category sorting
    if (options.sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
    } else if (options.sort === "category") {
      list.sort((a, b) => (a.service_item || "").localeCompare(b.service_item || "", "zh-Hant"));
    }

    const limit = options.limit || 200;
    const facilities = list.slice(0, limit);

    return { facilities, total: totalAll };
  } catch (err) {
    console.warn(`Failed to load facility seed fallback for ${facilityType}:`, err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const facilityType = params.get("type")?.trim();
  if (!facilityType) {
    return NextResponse.json({ error: "Missing required 'type' query param" }, { status: 400 });
  }

  const keyword = params.get("keyword")?.trim() || undefined;
  const lat = params.get("lat") ? Number(params.get("lat")) : undefined;
  const lng = params.get("lng") ? Number(params.get("lng")) : undefined;
  const radiusMeters = params.get("radius") ? Number(params.get("radius")) : undefined;
  const serviceItem = params.get("category")?.trim() || undefined;
  const onlyCharity = params.get("charity") === "1" || undefined;
  const sortParam = params.get("sort");
  const sort = sortParam === "distance" || sortParam === "name" || sortParam === "category" ? sortParam : undefined;
  // Issue #157: FacilitySearchContent paginates client-side (30/50/100 per page) over
  // whatever this endpoint returns, so its default 200-row cap needs to comfortably
  // cover a few pages at the largest page size. Callers may ask for more (clamped to
  // 500 to keep the Haversine-filtered query cheap); anything unparseable falls back
  // to searchFacilities()'s own default.
  const rawLimit = params.get("limit") ? Number(params.get("limit")) : undefined;
  const limit = rawLimit !== undefined && Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500) : undefined;

  try {
    // `total` deliberately takes nothing but `facilityType` — it is the size of the whole
    // dataset, not of this result set. The list UI prints the two side by side
    // (顯示 N 筆／全台共 M 筆) so that a nearby search returning a handful of rows, which is
    // normal for a geographically concentrated dataset, can't be misread as the dataset
    // itself being nearly empty. Passing keyword/radius/category in here would collapse
    // `total` back onto `facilities.length` and destroy the only comparison that matters.
    const [facilities, total] = await Promise.all([
      searchFacilities({ facilityType, keyword, lat, lng, radiusMeters, serviceItem, onlyCharity, sort, limit }),
      countFacilities(facilityType),
    ]);

    if (total > 0) {
      return NextResponse.json({ facilities, total });
    }

    // If DB is empty, use bundled seed fallback
    const fallback = getFacilitySeedFallback(facilityType, {
      keyword,
      lat,
      lng,
      radiusMeters,
      serviceItem,
      onlyCharity,
      sort,
      limit,
    });
    if (fallback) {
      return NextResponse.json(fallback);
    }

    return NextResponse.json({ facilities, total });
  } catch (error) {
    console.warn("GET /api/facilities DB query failed, attempting seed fallback:", error);
    const fallback = getFacilitySeedFallback(facilityType, {
      keyword,
      lat,
      lng,
      radiusMeters,
      serviceItem,
      onlyCharity,
      sort,
      limit,
    });
    if (fallback) {
      return NextResponse.json(fallback);
    }
    return NextResponse.json({ error: "查詢機構資料失敗" }, { status: 502 });
  }
}

