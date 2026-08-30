import fs from "node:fs";
import path from "node:path";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";
import type {
  CulturalActivityItem,
  CulturalShowInfo,
  PublicArtItem,
} from "./types";
import { runCulturalShowsSync } from "./ingestShows";
import { runPublicArtSync } from "./ingestPublicArt";

let cachedLocalPublicArt: PublicArtItem[] | null = null;

function getLocalPublicArt(): PublicArtItem[] {
  if (cachedLocalPublicArt) return cachedLocalPublicArt;
  try {
    const filePath = path.join(process.cwd(), "data", "public-art.json");
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (Array.isArray(data)) {
        cachedLocalPublicArt = data;
        return cachedLocalPublicArt;
      }
    }
  } catch (err) {
    console.error("[Culture Queries] Failed to load local public-art.json:", err);
  }
  return [];
}

let isSeedingShows = false;
let isSeedingPublicArt = false;

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
        runCulturalShowsSync()
          .then((res) => console.log("[Culture Queries] Shows auto-seed complete:", res))
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

  return await withConnection(async (conn) => {
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
      SELECT e.id, e.uid, e.title, e.category, e.category_label, e.description,
             e.image_url, e.master_unit, e.start_date, e.end_date,
             e.source_web_promote, e.web_sales, e.updated_at
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
        onSales: s.on_sales || "N",
        price: s.price || undefined,
        latitude: s.lat !== null ? Number(s.lat) : null,
        longitude: s.lng !== null ? Number(s.lng) : null,
        endTime: s.end_time || undefined,
      });
      showsByEventId.set(s.event_id, list);
    }

    const items: CulturalActivityItem[] = eventRows.map((e) => ({
      id: e.uid,
      title: e.title,
      category: e.category,
      categoryLabel: e.category_label,
      description: e.description || "",
      imageUrl: e.image_url || null,
      masterUnit: e.master_unit || null,
      startDate: e.start_date || "",
      endDate: e.end_date || "",
      sourceWebPromote: e.source_web_promote || null,
      webSales: e.web_sales || null,
      shows: showsByEventId.get(e.id) || [],
    }));

    return {
      items,
      totalMatched,
      updatedAt: new Date().toISOString(),
    };
  });
}

export interface SearchPublicArtParams {
  keyword?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number;
  limit?: number;
}

export async function searchPublicArt({
  keyword,
  city,
  lat,
  lng,
  radiusKm = 50,
  limit = 200,
}: SearchPublicArtParams): Promise<{
  items: PublicArtItem[];
  totalMatched: number;
  updatedAt: string;
}> {
  // Trigger auto-seed if empty in background
  checkAndTriggerAutoSeed("public_art");

  return await withConnection(async (conn) => {
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
             agency ${distanceSelectSql}
      FROM public_arts
      ${whereSql}
      ${havingSql}
      ORDER BY ${distanceOrderSql}
      LIMIT ?
    `;

    const [rows] = await conn.query<RowDataPacket[]>(querySql, queryParams);

    const items: PublicArtItem[] = rows.map((r) => ({
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
      distanceKm:
        r.distance_km !== undefined && r.distance_km !== null
          ? Math.round(Number(r.distance_km) * 10) / 10
          : undefined,
    }));

    if (items.length === 0) {
      const fallbackList = getLocalPublicArt();
      if (fallbackList.length > 0) {
        let filtered = [...fallbackList];
        if (keyword) {
          const kw = keyword.toLowerCase();
          filtered = filtered.filter(
            (i) =>
              i.title.toLowerCase().includes(kw) ||
              i.artist.toLowerCase().includes(kw) ||
              i.location.toLowerCase().includes(kw) ||
              (i.description && i.description.toLowerCase().includes(kw)) ||
              (i.fieldType && i.fieldType.toLowerCase().includes(kw)) ||
              (i.agency && i.agency.toLowerCase().includes(kw))
          );
        }
        if (city && city !== "全部縣市") {
          filtered = filtered.filter(
            (i) => i.city.includes(city) || i.location.includes(city)
          );
        }
        if (hasGps && lat !== null && lng !== null) {
          filtered = filtered
            .map((i) => {
              if (i.lat !== null && i.lng !== null) {
                const dist =
                  6371 *
                  Math.acos(
                    Math.min(
                      1.0,
                      Math.max(
                        -1.0,
                        Math.cos((lat * Math.PI) / 180) *
                          Math.cos((i.lat * Math.PI) / 180) *
                          Math.cos(((i.lng - lng) * Math.PI) / 180) +
                          Math.sin((lat * Math.PI) / 180) *
                            Math.sin((i.lat * Math.PI) / 180)
                      )
                    )
                  );
                return { ...i, distanceKm: Math.round(dist * 10) / 10 };
              }
              return i;
            })
            .filter((i) => i.distanceKm === undefined || i.distanceKm <= radiusKm)
            .sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));
        }
        return {
          items: filtered.slice(0, limit),
          totalMatched: filtered.length,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    return {
      items,
      totalMatched: items.length,
      updatedAt: new Date().toISOString(),
    };
  });
}

