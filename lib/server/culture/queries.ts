import fs from "node:fs";
import path from "node:path";
import { withConnection, withConnectionFallback, utcNowSql } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";
import type {
  CulturalActivityItem,
  CulturalShowInfo,
  PublicArtItem,
} from "./types";
import type { HeritageCategory } from "./ingestHeritageAssets";
import { runCulturalShowsSync } from "./ingestShows";
import { runPublicArtSync } from "./ingestPublicArt";
import { runIngestExternalEvents } from "./ingestExternalEvents";

let isSeedingShows = false;
let isSeedingPublicArt = false;

let cachedCulturalSeed: { ok: boolean; total: number; updatedAt: string; events: CulturalActivityItem[] } | null = null;
function getCulturalSeed() {
  if (cachedCulturalSeed) return cachedCulturalSeed;
  try {
    const p = path.join(process.cwd(), "data", "cultural-events-seed.json");
    if (fs.existsSync(p)) {
      cachedCulturalSeed = JSON.parse(fs.readFileSync(p, "utf-8"));
      return cachedCulturalSeed;
    }
  } catch (err) {
    console.warn("[Culture Queries] Failed to read cultural-events-seed.json:", err);
  }
  return null;
}

let cachedPublicArtSeed: any[] | null = null;
function getPublicArtSeed(): any[] | null {
  if (cachedPublicArtSeed) return cachedPublicArtSeed;
  try {
    const p = path.join(process.cwd(), "data", "public-art.json");
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
      cachedPublicArtSeed = Array.isArray(parsed) ? parsed : parsed.artworks || [];
      return cachedPublicArtSeed;
    }
  } catch (err) {
    console.warn("[Culture Queries] Failed to read public-art.json:", err);
  }
  return null;
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

async function checkAndTriggerAutoSeed(type: "shows" | "public_art"): Promise<void> {
  try {
    if (type === "shows" && !isSeedingShows) {
      const rows = await withConnection(async (conn) => {
        const [r] = await conn.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS cnt FROM cultural_events"
        );
        return r;
      });
      if (rows[0]?.cnt === 0) {
        isSeedingShows = true;
        console.log("[Culture Queries] cultural_events is empty, triggering background auto-seed...");
        Promise.allSettled([runCulturalShowsSync(), runIngestExternalEvents()])
          .then((results) => console.log("[Culture Queries] Shows & External auto-seed complete:", results))
          .catch((err) => console.error("[Culture Queries] Shows auto-seed error:", err))
          .finally(() => {
            isSeedingShows = false;
          });
      }
    } else if (type === "public_art" && !isSeedingPublicArt) {
      const rows = await withConnection(async (conn) => {
        const [r] = await conn.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS cnt FROM public_arts"
        );
        return r;
      });
      if (rows[0]?.cnt === 0) {
        isSeedingPublicArt = true;
        console.log("[Culture Queries] public_arts is empty, triggering background auto-seed...");
        runPublicArtSync()
          .then((res) => console.log("[Culture Queries] Public Art auto-seed complete:", res))
          .catch((err) => console.error("[Culture Queries] Public Art auto-seed error:", err))
          .finally(() => {
            isSeedingPublicArt = false;
          });
      }
    }
  } catch (err) {
    console.warn(`[Culture Queries] Auto-seed check error for ${type}:`, err);
  }
}

export interface SearchCulturalEventsParams {
  category?: string;
  keyword?: string;
  city?: string;
  limit?: number;
}

export async function searchCulturalEvents({
  category,
  keyword,
  city,
  limit = 200,
}: SearchCulturalEventsParams): Promise<{
  items: CulturalActivityItem[];
  totalMatched: number;
  updatedAt: string;
}> {
  // Trigger auto-seed if empty in background
  checkAndTriggerAutoSeed("shows");

  try {
    const dbResult = await withConnection(async (conn) => {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "/");

      const whereClauses: string[] = [
        "(e.end_date IS NULL OR e.end_date = '' OR e.end_date >= ?)",
      ];
      const params: unknown[] = [todayStr];

      if (category && category !== "all") {
        whereClauses.push("e.category = ?");
        params.push(category);
      }

      if (keyword) {
        const kwPattern = `%${keyword}%`;
        whereClauses.push(
          `(e.title LIKE ? OR e.description LIKE ? OR e.master_unit LIKE ? OR EXISTS (
             SELECT 1 FROM cultural_event_shows s
             WHERE s.event_id = e.id AND (s.location LIKE ? OR s.location_name LIKE ?)
           ))`
        );
        params.push(kwPattern, kwPattern, kwPattern, kwPattern, kwPattern);
      }

      if (city && city !== "全部縣市") {
        const cityPattern = `%${city}%`;
        whereClauses.push(
          `EXISTS (
             SELECT 1 FROM cultural_event_shows s
             WHERE s.event_id = e.id AND (s.city = ? OR s.location LIKE ? OR s.location_name LIKE ?)
           )`
        );
        params.push(city, cityPattern, cityPattern);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

      // Count total matching
      const [countRows] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM cultural_events e ${whereSql}`,
        params
      );
      const totalMatched = Number(countRows[0]?.total || 0);

      // Fetch matching events
      const querySql = `
        SELECT e.id, e.uid, e.title, e.title_en, e.category, e.category_label, e.description,
               e.description_en, e.image_url, e.master_unit, e.start_date, e.end_date,
               e.source_web_promote, e.web_sales, e.extra_json, e.updated_at
        FROM cultural_events e
        ${whereSql}
        ORDER BY CASE WHEN e.start_date IS NULL OR e.start_date = '' THEN 1 ELSE 0 END,
                 e.start_date ASC,
                 e.id DESC
        LIMIT ?
      `;

      const [eventRows] = await conn.query<RowDataPacket[]>(querySql, [
        ...params,
        limit,
      ]);

      if (eventRows.length === 0) {
        return {
          items: [],
          totalMatched,
          updatedAt: new Date().toISOString(),
        };
      }

      const eventIds = eventRows.map((r) => r.id);

      // Fetch shows for these events
      const [showRows] = await conn.query<RowDataPacket[]>(
        `SELECT event_id, show_time, location, location_name, city, on_sales,
                price, lat, lng, end_time
         FROM cultural_event_shows
         WHERE event_id IN (?)
         ORDER BY id ASC`,
        [eventIds]
      );

      const showsByEventId = new Map<number, CulturalShowInfo[]>();
      for (const s of showRows) {
        const list = showsByEventId.get(s.event_id) || [];
        list.push({
          time: s.show_time || "",
          location: s.location || "",
          locationName: s.location_name || "",
          city: s.city || null,
          onSales: s.on_sales || "N",
          price: s.price || undefined,
          latitude: s.lat !== null ? Number(s.lat) : null,
          longitude: s.lng !== null ? Number(s.lng) : null,
          endTime: s.end_time || undefined,
        });
        showsByEventId.set(s.event_id, list);
      }

      const items: CulturalActivityItem[] = eventRows.map((e) => {
        let extraJson: Record<string, unknown> | null = null;
        if (e.extra_json) {
          try {
            extraJson = typeof e.extra_json === "string" ? JSON.parse(e.extra_json) : e.extra_json;
          } catch {}
        }
        return {
          id: e.uid,
          title: e.title,
          titleEn: e.title_en || null,
          category: e.category,
          categoryLabel: e.category_label,
          description: e.description || "",
          descriptionEn: e.description_en || null,
          imageUrl: e.image_url || null,
          masterUnit: e.master_unit || null,
          startDate: e.start_date || "",
          endDate: e.end_date || "",
          sourceWebPromote: e.source_web_promote || null,
          webSales: e.web_sales || null,
          extraJson,
          shows: showsByEventId.get(e.id) || [],
        };
      });

      return {
        items,
        totalMatched,
        updatedAt: new Date().toISOString(),
      };
    });

    if (dbResult && dbResult.items.length > 0) {
      return dbResult;
    }
  } catch (dbErr) {
    console.warn("[Culture Queries] Database query failed, falling back to static seed:", dbErr);
  }

  // Fallback to static seed
  const seed = getCulturalSeed();
  if (seed && Array.isArray(seed.events)) {
    let filtered = seed.events;
    if (category && category !== "all") {
      filtered = filtered.filter((e) => e.category === category);
    }
    if (keyword) {
      const kw = keyword.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.title.toLowerCase().includes(kw) ||
          (e.description && e.description.toLowerCase().includes(kw)) ||
          (e.masterUnit && e.masterUnit.toLowerCase().includes(kw)) ||
          (e.shows && e.shows.some((s) => s.location.toLowerCase().includes(kw) || s.locationName.toLowerCase().includes(kw)))
      );
    }
    if (city && city !== "全部縣市") {
      filtered = filtered.filter(
        (e) => e.shows && e.shows.some((s) => (s.city && s.city.includes(city)) || s.location.includes(city))
      );
    }
    return {
      items: filtered.slice(0, limit),
      totalMatched: filtered.length,
      updatedAt: seed.updatedAt || new Date().toISOString(),
    };
  }

  return { items: [], totalMatched: 0, updatedAt: new Date().toISOString() };
}

export interface SearchPublicArtParams {
  keyword?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number;
  limit?: number;
  fieldType?: string; // 'all' | 'art' | 'venue'
}

export async function searchPublicArt({
  keyword,
  city,
  lat,
  lng,
  radiusKm = 50,
  limit = 200,
  fieldType = "all",
}: SearchPublicArtParams): Promise<{
  items: PublicArtItem[];
  totalMatched: number;
  updatedAt: string;
}> {
  // Trigger auto-seed if empty in background
  checkAndTriggerAutoSeed("public_art");

  try {
    const dbResult = await withConnection(async (conn) => {
      const hasGps =
        lat !== null &&
        lat !== undefined &&
        lng !== null &&
        lng !== undefined &&
        !isNaN(lat) &&
        !isNaN(lng);

      const whereClauses: string[] = [];
      const params: unknown[] = [];

      let distanceSelectSql = "";
      let distanceOrderSql = "id DESC";
      let havingSql = "";

      if (hasGps) {
        distanceSelectSql = `, (6371 * acos(LEAST(1.0, GREATEST(-1.0,
          cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) +
          sin(radians(?)) * sin(radians(lat))
        )))) AS distance_km`;
        params.push(lat, lng, lat);

        whereClauses.push("lat IS NOT NULL AND lng IS NOT NULL");
        havingSql = "HAVING distance_km <= ?";
        distanceOrderSql = "distance_km ASC";
      }

      if (fieldType === "venue") {
        whereClauses.push("field_type = '演藝活動場所'");
      } else if (fieldType === "art") {
        whereClauses.push("(field_type IS NULL OR field_type != '演藝活動場所')");
      }

      if (keyword) {
        const kw = `%${keyword.toLowerCase()}%`;
        whereClauses.push(
          `(LOWER(title) LIKE ? OR LOWER(artist) LIKE ? OR LOWER(location) LIKE ? OR LOWER(description) LIKE ? OR LOWER(field_type) LIKE ? OR LOWER(agency) LIKE ?)`
        );
        params.push(kw, kw, kw, kw, kw, kw);
      }

      if (city && city !== "全部縣市") {
        whereClauses.push(`(city LIKE ? OR location LIKE ?)`);
        params.push(`%${city}%`, `%${city}%`);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

      const queryParams = [...params];
      if (hasGps) {
        queryParams.push(radiusKm);
      }
      queryParams.push(limit);

      const querySql = `
        SELECT id, art_no, title, artist, dimensions, material, city, location,
               lat, lng, field_type, description, image_url, year, source_url,
               agency, extra_json ${distanceSelectSql}
        FROM public_arts
        ${whereSql}
        ${havingSql}
        ORDER BY ${distanceOrderSql}
        LIMIT ?
      `;

      const [rows] = await conn.query<RowDataPacket[]>(querySql, queryParams);

      const items: PublicArtItem[] = rows.map((r) => {
        let extraJson: Record<string, unknown> | null = null;
        if (r.extra_json) {
          try {
            extraJson = typeof r.extra_json === "string" ? JSON.parse(r.extra_json) : r.extra_json;
          } catch {}
        }
        return {
          id: r.art_no,
          artNo: r.art_no,
          title: r.title,
          artist: r.artist || "未提供作者",
          dimensions: r.dimensions || null,
          material: r.material || null,
          city: r.city || "",
          location: r.location || "",
          lat: r.lat !== null ? Number(r.lat) : null,
          lng: r.lng !== null ? Number(r.lng) : null,
          fieldType: r.field_type || null,
          description: r.description || null,
          imageUrl: r.image_url || null,
          year: r.year || null,
          sourceUrl: r.source_url || null,
          agency: r.agency || null,
          extraJson,
          distanceKm:
            r.distance_km !== undefined && r.distance_km !== null
              ? Math.round(Number(r.distance_km) * 10) / 10
              : undefined,
        };
      });

      return {
        items,
        totalMatched: items.length,
        updatedAt: new Date().toISOString(),
      };
    });

    if (dbResult && dbResult.items.length > 0) {
      return dbResult;
    }
  } catch (dbErr) {
    console.warn("[Culture Queries] Database query failed for public art, falling back to static seed:", dbErr);
  }

  // Fallback to static public-art.json
  const seed = getPublicArtSeed();
  if (seed && Array.isArray(seed)) {
    let filtered = seed.map((item) => {
      const artNo = item.artNo || item["作品編號"] || item.id || "";
      const isVenue = item.fieldType === "演藝活動場所" || String(artNo).startsWith("VENUE_");
      const itemLat = item.lat != null ? Number(item.lat) : (item["緯度"] != null ? Number(item["緯度"]) : null);
      const itemLng = item.lng != null ? Number(item.lng) : (item["經度"] != null ? Number(item["經度"]) : null);

      let distanceKm: number | undefined;
      if (lat != null && lng != null && itemLat != null && itemLng != null) {
        distanceKm = calculateDistanceKm(lat, lng, itemLat, itemLng);
      }

      return {
        id: String(artNo),
        artNo: String(artNo),
        title: item.title || item["作品名稱"] || "",
        artist: item.artist || item["作者"] || "未提供作者",
        dimensions: item.dimensions || item["作品尺寸"] || null,
        material: item.material || item["作品材質"] || null,
        city: item.city || item["縣市"] || "",
        location: item.location || item["設置地點"] || "",
        lat: itemLat,
        lng: itemLng,
        fieldType: isVenue ? "演藝活動場所" : (item.fieldType || item["場域"] || "公共藝術"),
        description: item.description || item["作品說明"] || null,
        imageUrl: item.imageUrl || item["主圖"] || null,
        year: item.year || item["創作年代yyyy"] || null,
        sourceUrl: item.sourceUrl || item["來源網站"] || null,
        agency: item.agency || item["委託單位"] || null,
        extraJson: item.extraJson || null,
        distanceKm,
      } as PublicArtItem;
    });

    // FieldType filtering
    if (fieldType === "venue") {
      filtered = filtered.filter((p) => p.fieldType === "演藝活動場所");
    } else if (fieldType === "art") {
      filtered = filtered.filter((p) => p.fieldType !== "演藝活動場所");
    }

    if (city && city !== "全部縣市") {
      filtered = filtered.filter((p) => p.city.includes(city) || p.location.includes(city));
    }

    if (keyword) {
      const kw = keyword.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(kw) ||
          p.artist.toLowerCase().includes(kw) ||
          p.location.toLowerCase().includes(kw) ||
          (p.description && p.description.toLowerCase().includes(kw))
      );
    }

    if (lat != null && lng != null) {
      filtered = filtered.filter((p) => p.distanceKm != null && p.distanceKm <= radiusKm);
      filtered.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
    }

    return {
      items: filtered.slice(0, limit),
      totalMatched: filtered.length,
      updatedAt: new Date().toISOString(),
    };
  }

  return { items: [], totalMatched: 0, updatedAt: new Date().toISOString() };
}

export interface HeritageAssetPoint {
  id: number;
  caseId: string;
  category: HeritageCategory;
  caseName: string;
  assetsTypeNames: string | null;
  classifyCode: string | null;
  classifyName: string | null;
  cityName: string | null;
  distName: string | null;
  address: string | null;
  pastHistory: string | null;
  registerReason: string | null;
  govInstitutionName: string | null;
  lng: number;
  lat: number;
  imageUrl: string | null;
  imageSource: string | null;
}

export interface HeritageMapData {
  points: HeritageAssetPoint[];
  /** Most recent sync timestamp across every category present in `points`, or
   * null if the table is empty. Drives the "最後同步時間" header. */
  updatedAt: string | null;
}

/** Reads every heritage_assets row with usable coordinates (~1,800 rows total
 * across both categories — small enough to fetch in one shot; the frontend
 * filters by category client-side via the layer toggle checkboxes). Rows with
 * NULL longitude/latitude are excluded here — they still exist in the table
 * but are never plottable, per docs/specs/heritage-assets-map.md. */
export async function getHeritageMapData(): Promise<HeritageMapData> {
  return withConnectionFallback({ points: [], updatedAt: null }, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, case_id, category, case_name, assets_type_names, classify_code,
              classify_name, city_name, dist_name, address, past_history,
              register_reason, gov_institution_name, longitude, latitude,
              image_url, image_source, source_updated_at
         FROM heritage_assets
        WHERE longitude IS NOT NULL AND latitude IS NOT NULL
        ORDER BY category, case_name`,
    );

    let latestUpdatedAt: string | null = null;
    const points: HeritageAssetPoint[] = rows.map((row) => {
      const sourceUpdatedAt: string | null = row.source_updated_at
        ? new Date(row.source_updated_at).toISOString()
        : null;
      if (sourceUpdatedAt && (!latestUpdatedAt || sourceUpdatedAt > latestUpdatedAt)) {
        latestUpdatedAt = sourceUpdatedAt;
      }

      return {
        id: Number(row.id),
        caseId: String(row.case_id),
        category: row.category as HeritageCategory,
        caseName: String(row.case_name),
        assetsTypeNames: row.assets_type_names ?? null,
        classifyCode: row.classify_code ?? null,
        classifyName: row.classify_name ?? null,
        cityName: row.city_name ?? null,
        distName: row.dist_name ?? null,
        address: row.address ?? null,
        pastHistory: row.past_history ?? null,
        registerReason: row.register_reason ?? null,
        govInstitutionName: row.gov_institution_name ?? null,
        lng: Number(row.longitude),
        lat: Number(row.latitude),
        imageUrl: row.image_url ?? null,
        imageSource: row.image_source ?? null,
      };
    });

    return { points, updatedAt: latestUpdatedAt };
  });
}

