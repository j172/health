import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { countFacilities, countFilteredFacilities, searchFacilities } from "@/lib/server/facilities/queries";

import tourismFactorySeed from "@/data/facilities-seeds/tourism_factory.json";
import bookstoreSeed from "@/data/facilities-seeds/bookstore.json";
import contraceptionSeed from "@/data/contraception-map-seed.json";
import cpcGasStationSeed from "@/data/facilities-seeds/cpc_gas_station.json";
import aedSeed from "@/data/facilities-seeds/aed.json";
import vetClinicSeedRaw from "@/data/facilities-seeds/vet_clinic.json";

export const runtime = "nodejs";

interface SeedFacilityItem {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  service_item: string | null;
  service_time?: string | null;
  extra_json?: any;
  distance_km?: number;
}

const vetClinicSeed: SeedFacilityItem[] = ((vetClinicSeedRaw as any).records || []).map((r: any, idx: number) => ({
  id: idx + 1,
  name: r.name,
  address: r.address || null,
  phone: r.phone || null,
  lat: r.lat ? Number(r.lat) : null,
  lng: r.lng ? Number(r.lng) : null,
  service_item: r.serviceItem || null,
  service_time: r.serviceTime || null,
  extra_json: r.extra || null,
}));

const SEED_FACILITIES: Record<string, SeedFacilityItem[]> = {
  tourism_factory: tourismFactorySeed as unknown as SeedFacilityItem[],
  bookstore: bookstoreSeed as unknown as SeedFacilityItem[],
  cpc_gas_station: cpcGasStationSeed as unknown as SeedFacilityItem[],
  aed: aedSeed as unknown as SeedFacilityItem[],
  vet_clinic: vetClinicSeed,
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
    county?: string;
    district?: string;
    lat?: number;
    lng?: number;
    radiusMeters?: number;
    serviceItem?: string;
    onlyCharity?: boolean;
    sort?: string;
    limit?: number;
    offset?: number;
  },
): { facilities: SeedFacilityItem[]; total: number; allTotal: number } | null {
  try {
    let raw = SEED_FACILITIES[facilityType];

    if (options.serviceItem === "避孕諮詢" && (facilityType === "clinic" || facilityType === "pharmacy")) {
      const isClinic = facilityType === "clinic";
      const beokPoints = ((contraceptionSeed as any).points || []).filter(
        (p: any) => (isClinic ? p.category === "clinic" : p.category === "pharmacy"),
      );
      raw = beokPoints.map((p: any) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        phone: p.phone || null,
        lat: p.lat,
        lng: p.lng,
        service_item: isClinic ? "避孕諮詢診所" : "避孕諮詢藥局",
        extra_json: { beokCertified: true, source: p.source },
      }));
    }

    if (options.serviceItem === "違規／停約" && facilityType === "clinic") {
      const penaltySeedPath = path.join(process.cwd(), "data", "facilities-seeds", "nhi-penalties.json");
      if (fs.existsSync(penaltySeedPath)) {
        const parsed = JSON.parse(fs.readFileSync(penaltySeedPath, "utf-8"));
        const list = Array.isArray(parsed) ? parsed : [];
        raw = list.map((item: any, idx: number) => ({
          id: item.id ?? idx + 1,
          name: item.name,
          address: item.address ?? null,
          phone: item.phone ?? null,
          lat: item.lat ?? null,
          lng: item.lng ?? null,
          service_item: item.service_item ?? item.serviceItem ?? "健保違規停約",
          extra_json: item.extra_json ?? item.extra ?? null,
        }));
      }
    }

    if (!raw) {
      const seedPath = path.join(process.cwd(), "data", "facilities-seeds", `${facilityType}.json`);
      if (fs.existsSync(seedPath)) {
        const parsed = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
        const list = Array.isArray(parsed) ? parsed : (parsed.records || parsed.facilities || []);
        raw = list.map((item: any, idx: number) => ({
          id: item.id ?? idx + 1,
          name: item.name,
          address: item.address ?? null,
          phone: item.phone ?? null,
          lat: item.lat ?? null,
          lng: item.lng ?? null,
          service_item: item.service_item ?? item.serviceItem ?? null,
          service_time: item.service_time ?? item.serviceTime ?? item.extra_json?.openHours ?? null,
          extra_json: item.extra_json ?? item.extra ?? null,
        }));
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
        const p = (item.extra_json?.penalty?.practitioner || "").toLowerCase().replace(/臺/g, "台");
        return n.includes(kw) || a.includes(kw) || s.includes(kw) || p.includes(kw);
      });
    }

    // 2. County filter
    if (options.county) {
      const c = options.county.toLowerCase().trim().replace(/台/g, "臺");
      list = list.filter((item) => (item.address || "").toLowerCase().replace(/台/g, "臺").includes(c));
    }

    // 3. District filter
    if (options.district) {
      const d = options.district.trim();
      list = list.filter((item) => (item.address || "").includes(d));
    }

    // 4. Category / serviceItem filter
    if (options.serviceItem === "違規／停約" || options.serviceItem === "違規" || options.serviceItem === "停約") {
      list = list.filter((item) => Boolean(item.extra_json?.penalty || item.service_item?.includes("違規") || item.service_item?.includes("停約")));
    } else if (options.serviceItem) {
      const cat = options.serviceItem.trim();
      list = list.filter((item) => item.service_item && item.service_item.includes(cat));
    }

    // 5. Charity filter
    if (options.onlyCharity) {
      list = list.filter((item) => item.extra_json?.charityUrl);
    }

    // 6. GPS Distance calculation & radius filter
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

    // 7. Explicit sorting
    if (options.sort === "newest") {
      list.sort((a, b) => b.id - a.id);
    } else if (options.sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
    } else if (options.sort === "category") {
      list.sort((a, b) => (a.service_item || "").localeCompare(b.service_item || "", "zh-Hant"));
    }

    const totalFiltered = list.length;
    const offset = options.offset || 0;
    const limit = options.limit || 30;
    const facilities = list.slice(offset, offset + limit);

    return { facilities, total: totalFiltered, allTotal: totalAll };
  } catch (err) {
    console.warn(`Failed to load facility seed fallback for ${facilityType}:`, err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const facilityType = params.get("type")?.trim() || params.get("facilityType")?.trim();
  if (!facilityType) {
    return NextResponse.json({ error: "Missing required 'type' query param" }, { status: 400 });
  }

  const keyword = params.get("keyword")?.trim() || undefined;
  const county = params.get("county")?.trim() || undefined;
  const district = params.get("district")?.trim() || undefined;
  const lat = params.get("lat") ? Number(params.get("lat")) : undefined;
  const lng = params.get("lng") ? Number(params.get("lng")) : undefined;
  const radiusMeters = params.get("radius") ? Number(params.get("radius")) : undefined;
  const serviceItem = params.get("category")?.trim() || undefined;
  const onlyCharity = params.get("charity") === "1" || undefined;
  const sortParam = params.get("sort");
  const sort =
    sortParam === "distance" || sortParam === "name" || sortParam === "category" || sortParam === "newest"
      ? sortParam
      : undefined;

  const pageParam = params.get("page") ? Number(params.get("page")) : 1;
  const page = Number.isFinite(pageParam) ? Math.max(1, Math.trunc(pageParam)) : 1;

  const pageSizeParam = params.get("pageSize") || params.get("limit");
  const rawLimit = pageSizeParam ? Number(pageSizeParam) : 30;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500) : 30;

  const rawOffset = params.get("offset") ? Number(params.get("offset")) : (page - 1) * limit;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.trunc(rawOffset)) : 0;

  try {
    if (serviceItem === "避孕諮詢") {
      const fallback = getFacilitySeedFallback(facilityType, {
        keyword,
        county,
        district,
        lat,
        lng,
        radiusMeters,
        serviceItem,
        onlyCharity,
        sort,
        limit,
        offset,
      });
      if (fallback) {
        return NextResponse.json({ ...fallback, page, pageSize: limit });
      }
    }

    const hasFilters = Boolean(keyword || county || district || serviceItem || onlyCharity);

    const [facilities, allTotal, filteredTotal] = await Promise.all([
      searchFacilities({
        facilityType,
        keyword,
        county,
        district,
        lat,
        lng,
        radiusMeters,
        serviceItem,
        onlyCharity,
        sort,
        limit,
        offset,
      }),
      countFacilities(facilityType),
      hasFilters
        ? countFilteredFacilities(facilityType, { keyword, county, district, serviceItem, onlyCharity })
        : Promise.resolve(null),
    ]);

    if (allTotal > 0) {
      const total = typeof filteredTotal === "number" ? filteredTotal : allTotal;
      return NextResponse.json({
        facilities,
        total,
        allTotal,
        page,
        pageSize: limit,
      });
    }

    // If DB is empty, use bundled seed fallback
    const fallback = getFacilitySeedFallback(facilityType, {
      keyword,
      county,
      district,
      lat,
      lng,
      radiusMeters,
      serviceItem,
      onlyCharity,
      sort,
      limit,
      offset,
    });
    if (fallback) {
      return NextResponse.json({ ...fallback, page, pageSize: limit });
    }

    return NextResponse.json({ facilities, total: 0, allTotal: 0, page, pageSize: limit });
  } catch (error) {
    console.warn("GET /api/facilities DB query failed, attempting seed fallback:", error);
    const fallback = getFacilitySeedFallback(facilityType, {
      keyword,
      county,
      district,
      lat,
      lng,
      radiusMeters,
      serviceItem,
      onlyCharity,
      sort,
      limit,
      offset,
    });
    if (fallback) {
      return NextResponse.json({ ...fallback, page, pageSize: limit });
    }
    return NextResponse.json({ error: "查詢機構資料失敗" }, { status: 502 });
  }
}

