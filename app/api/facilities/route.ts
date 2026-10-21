import { NextRequest, NextResponse } from "next/server";
import { countFacilities, countFilteredFacilities, searchFacilities } from "@/lib/server/facilities/queries";
import { getFacilitySourceDataStatus } from "@/lib/server/facilities/dataStatus";
import { parseDataStatusSourceParam } from "@/lib/format/facilityDataStatus";

import { readSeedJson, readTransientSeedJson } from "@/lib/server/db/transientSeed";
import { isSafeSeedFileStem } from "@/lib/server/facilities/seedFileName";

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

// 這幾份種子（合計約 3.5 MB）原本是靜態 import，文字永久常駐於 server chunk、解析後的物件
// 也永遠留在模組裡；現在只在「資料庫沒資料／查詢失敗／避孕諮詢」需要時才按需讀檔，
// 並於短暫停留後釋放（#709，見 lib/server/db/transientSeed.ts）。
// 檔名一律寫死在這裡，絕不可把 facilityType 之類的使用者輸入帶進讀取器。
const STATIC_SEED_FILES: Record<string, string> = {
  tourism_factory: "facilities-seeds/tourism_factory.json",
  bookstore: "facilities-seeds/bookstore.json",
  cpc_gas_station: "facilities-seeds/cpc_gas_station.json",
  aed: "facilities-seeds/aed.json",
};
const VET_CLINIC_SEED_FILE = "facilities-seeds/vet_clinic.json";
const CONTRACEPTION_SEED_FILE = "contraception-map-seed.json";
const NHI_PENALTY_SEED_FILE = "facilities-seeds/nhi-penalties.json";

/** 回傳該類型的內建種子；沒有內建種子（或檔案讀不到）時回傳 undefined，由呼叫端走原本的通用後備。 */
function loadBundledSeed(facilityType: string): SeedFacilityItem[] | undefined {
  if (facilityType === "vet_clinic") {
    const vetClinicSeedRaw = readTransientSeedJson<any>(VET_CLINIC_SEED_FILE);
    if (!vetClinicSeedRaw) return undefined;
    return (vetClinicSeedRaw.records || []).map((r: any, idx: number) => ({
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
  }
  if (!Object.prototype.hasOwnProperty.call(STATIC_SEED_FILES, facilityType)) return undefined;
  const seed = readTransientSeedJson<SeedFacilityItem[]>(STATIC_SEED_FILES[facilityType]);
  return seed ?? undefined;
}

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
    serviceMethod?: string;
    onlyCharity?: boolean;
    sort?: string;
    limit?: number;
    offset?: number;
  },
): { facilities: SeedFacilityItem[]; total: number; allTotal: number } | null {
  try {
    let raw = loadBundledSeed(facilityType);

    if (options.serviceItem === "避孕諮詢" && (facilityType === "clinic" || facilityType === "pharmacy")) {
      const isClinic = facilityType === "clinic";
      const contraceptionSeed = readTransientSeedJson<any>(CONTRACEPTION_SEED_FILE);
      const beokPoints = ((contraceptionSeed as any)?.points || []).filter(
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
      const parsed = readSeedJson<unknown>(NHI_PENALTY_SEED_FILE);
      if (parsed !== null) {
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

    if (!raw && isSafeSeedFileStem(facilityType)) {
      // facilityType 來自網址參數：只接受單純的檔名，避免 `../` 讀到種子資料夾以外的 .json。
      // optional：多數類型本來就沒有種子檔，找不到不該寫警告（也避免網址參數製造無限多筆警告紀錄）。
      const parsed = readSeedJson<any>(`facilities-seeds/${facilityType}.json`, { optional: true });
      if (parsed !== null) {
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

    // 4b. Second filter dimension (extra_json.serviceMethod — see
    // searchFacilities()'s serviceMethod param for why this needs its own
    // extra_json-keyed filter instead of reusing service_item).
    if (options.serviceMethod) {
      const sm = options.serviceMethod.trim();
      list = list.filter((item) => item.extra_json?.serviceMethod && String(item.extra_json.serviceMethod).includes(sm));
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

// 2026-10-15: this route had no Cache-Control of its own, so it fell
// through to a default (Cache-Control: max-age=1800, cf-cache-status: HIT)
// applied somewhere upstream of this app to every /api/* response lacking
// an explicit header — confirmed not set by this app, next.config.js,
// middleware.ts, or the .remote-health-index.php proxy (which forwards
// origin headers verbatim). Admin-synced facility data could then read as
// stale/empty for up to 30 minutes after a sync. A short explicit TTL here
// is enough to make Cloudflare/the host respect it instead of falling back
// to that default — confirmed live: routes with their own explicit
// Cache-Control (even `no-store`) are always honored exactly as declared.
const FACILITIES_CACHE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };

function jsonWithCache(data: unknown): NextResponse {
  return NextResponse.json(data, { headers: FACILITIES_CACHE_HEADERS });
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
  const serviceMethod = params.get("serviceMethod")?.trim() || undefined;
  const onlyCharity = params.get("charity") === "1" || undefined;
  // Opt-in (issue #678): asks for the row count + newest import date of ONE
  // source_key inside this facility type, for tools backed by a manually
  // imported source. Absent = no extra query and an unchanged response.
  const dataStatusSource = parseDataStatusSourceParam(params.get("dataStatusSource"));
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
        serviceMethod,
        onlyCharity,
        sort,
        limit,
        offset,
      });
      if (fallback) {
        return jsonWithCache({ ...fallback, page, pageSize: limit });
      }
    }

    const hasFilters = Boolean(keyword || county || district || serviceItem || serviceMethod || onlyCharity);

    const [facilities, allTotal, filteredTotal, dataStatus] = await Promise.all([
      searchFacilities({
        facilityType,
        keyword,
        county,
        district,
        lat,
        lng,
        radiusMeters,
        serviceItem,
        serviceMethod,
        onlyCharity,
        sort,
        limit,
        offset,
      }),
      countFacilities(facilityType),
      hasFilters
        ? countFilteredFacilities(facilityType, { keyword, county, district, serviceItem, serviceMethod, onlyCharity })
        : Promise.resolve(null),
      // A failed status query degrades to "unknown" (field omitted), never to
      // a 500 for the whole list and never to a fake zero-row 「資料暫缺」.
      dataStatusSource
        ? getFacilitySourceDataStatus(facilityType, dataStatusSource).catch(() => null)
        : Promise.resolve(null),
    ]);

    if (allTotal > 0) {
      const total = typeof filteredTotal === "number" ? filteredTotal : allTotal;
      return jsonWithCache({
        facilities,
        total,
        allTotal,
        page,
        pageSize: limit,
        ...(dataStatus ? { dataStatus } : {}),
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
      serviceMethod,
      onlyCharity,
      sort,
      limit,
      offset,
    });
    if (fallback) {
      return jsonWithCache({ ...fallback, page, pageSize: limit });
    }

    return jsonWithCache({
      facilities,
      total: 0,
      allTotal: 0,
      page,
      pageSize: limit,
      ...(dataStatus ? { dataStatus } : {}),
    });
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
      serviceMethod,
      onlyCharity,
      sort,
      limit,
      offset,
    });
    if (fallback) {
      return jsonWithCache({ ...fallback, page, pageSize: limit });
    }
    return NextResponse.json({ error: "查詢機構資料失敗" }, { status: 502 });
  }
}

