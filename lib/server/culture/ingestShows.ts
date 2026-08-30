import { fetchGovData } from "@/lib/server/http/govFetch";
import { withConnection, utcNowSql, withTransaction } from "@/lib/server/db/mysql";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { ALL_CATEGORIES, CATEGORY_LABELS } from "./types";

const CULTURE_BASE_URL =
  "https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ";

const TAIWAN_CITIES = [
  "基隆市", "臺北市", "台北市", "新北市", "桃園市", "新竹市", "新竹縣",
  "苗栗縣", "臺中市", "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市",
  "嘉義縣", "臺南市", "台南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣",
  "臺東縣", "台東縣", "澎湖縣", "金門縣", "連江縣",
];

function extractCity(locationStr: string, locationNameStr: string): string {
  const combined = `${locationStr} ${locationNameStr}`;
  for (const c of TAIWAN_CITIES) {
    if (combined.includes(c)) {
      if (c === "台北市") return "臺北市";
      if (c === "台中市") return "臺中市";
      if (c === "台南市") return "臺南市";
      if (c === "台東縣") return "臺東縣";
      return c;
    }
  }
  return "";
}

function toSafeString(v: any): string {
  if (!v) return "";
  if (Array.isArray(v)) return v.map(toSafeString).filter(Boolean).join("、");
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

async function fetchCategoryData(cat: string): Promise<any[]> {
  try {
    const res = await fetchGovData(`${CULTURE_BASE_URL}&category=${cat}`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.warn(`[Culture Ingest] category ${cat} fetch error:`, err);
  }
  return [];
}

export interface IngestShowsResult {
  totalFetched: number;
  uniqueEvents: number;
  insertedOrUpdated: number;
  deletedExpired: number;
}

export async function runCulturalShowsSync(): Promise<IngestShowsResult> {
  const rawResults = await Promise.all(
    ALL_CATEGORIES.map((cat) => fetchCategoryData(cat))
  );
  const flatList = rawResults.flat();

  const seenIds = new Set<string>();
  const validEvents: Array<{
    uid: string;
    title: string;
    category: string;
    categoryLabel: string;
    description: string | null;
    imageUrl: string | null;
    masterUnit: string | null;
    startDate: string | null;
    endDate: string | null;
    sourceWebPromote: string | null;
    webSales: string | null;
    shows: Array<{
      showTime: string | null;
      location: string | null;
      locationName: string | null;
      city: string | null;
      onSales: string;
      price: string | null;
      lat: number | null;
      lng: number | null;
      endTime: string | null;
    }>;
  }> = [];

  for (const item of flatList) {
    const uid = toSafeString(item.UID);
    const title = toSafeString(item.title);
    if (!uid || !title) continue;
    if (seenIds.has(uid)) continue;
    seenIds.add(uid);

    const cat = toSafeString(item.category) || "6";
    const catLabel = CATEGORY_LABELS[cat] || "🎨 藝文活動";
    const master = toSafeString(item.masterUnit || item.showUnit) || null;

    const shows = (item.showInfo || []).map((s: any) => {
      const location = toSafeString(s.location) || null;
      const locationName = toSafeString(s.locationName) || null;
      const city = extractCity(location || "", locationName || "") || null;
      const lat = s.latitude ? parseFloat(String(s.latitude)) : null;
      const lng = s.longitude ? parseFloat(String(s.longitude)) : null;

      return {
        showTime: toSafeString(s.time) || null,
        location,
        locationName,
        city,
        onSales: toSafeString(s.onSales) || "N",
        price: toSafeString(s.price) || null,
        lat: lat && !isNaN(lat) ? lat : null,
        lng: lng && !isNaN(lng) ? lng : null,
        endTime: toSafeString(s.endTime) || null,
      };
    });

    validEvents.push({
      uid,
      title,
      category: cat,
      categoryLabel: catLabel,
      description: toSafeString(item.descriptionFilterHtml || item.comment) || null,
      imageUrl: toSafeString(item.imageUrl) || null,
      masterUnit: master,
      startDate: toSafeString(item.startDate) || null,
      endDate: toSafeString(item.endDate) || null,
      sourceWebPromote: toSafeString(item.sourceWebPromote) || null,
      webSales: toSafeString(item.webSales) || null,
      shows,
    });
  }

  const now = utcNowSql();
  let countProcessed = 0;

  // Batch process into MySQL
  const BATCH_SIZE = 50;
  for (let i = 0; i < validEvents.length; i += BATCH_SIZE) {
    const chunk = validEvents.slice(i, i + BATCH_SIZE);
    await withTransaction(async (conn) => {
      for (const ev of chunk) {
        // Upsert cultural_events
        await conn.execute(
          `INSERT INTO cultural_events (
             uid, title, category, category_label, description, image_url,
             master_unit, start_date, end_date, source_web_promote, web_sales,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             title = VALUES(title),
             category = VALUES(category),
             category_label = VALUES(category_label),
             description = VALUES(description),
             image_url = VALUES(image_url),
             master_unit = VALUES(master_unit),
             start_date = VALUES(start_date),
             end_date = VALUES(end_date),
             source_web_promote = VALUES(source_web_promote),
             web_sales = VALUES(web_sales),
             updated_at = VALUES(updated_at)`,
          [
            ev.uid,
            ev.title,
            ev.category,
            ev.categoryLabel,
            ev.description,
            ev.imageUrl,
            ev.masterUnit,
            ev.startDate,
            ev.endDate,
            ev.sourceWebPromote,
            ev.webSales,
            now,
            now,
          ]
        );

        // Retrieve event ID
        const [rows] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM cultural_events WHERE uid = ?",
          [ev.uid]
        );
        const eventId = rows[0]?.id;
        if (!eventId) continue;

        // Clear and re-insert shows for this event
        await conn.execute(
          "DELETE FROM cultural_event_shows WHERE event_id = ?",
          [eventId]
        );

        if (ev.shows.length > 0) {
          const showValues = ev.shows.map((s) => [
            eventId,
            s.showTime,
            s.location,
            s.locationName,
            s.city,
            s.onSales,
            s.price,
            s.lat,
            s.lng,
            s.endTime,
            now,
          ]);

          await conn.query(
            `INSERT INTO cultural_event_shows (
               event_id, show_time, location, location_name, city,
               on_sales, price, lat, lng, end_time, created_at
             ) VALUES ?`,
            [showValues]
          );
        }

        countProcessed++;
      }
    });
  }

  // Cleanup expired events older than 30 days
  const thirtyDaysAgoDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "/");

  let deletedExpired = 0;
  await withConnection(async (conn) => {
    const [delResult] = await conn.execute<ResultSetHeader>(
      `DELETE FROM cultural_events
       WHERE end_date IS NOT NULL AND end_date != '' AND end_date < ?`,
      [thirtyDaysAgoDate]
    );
    deletedExpired = delResult.affectedRows;
  });

  return {
    totalFetched: flatList.length,
    uniqueEvents: validEvents.length,
    insertedOrUpdated: countProcessed,
    deletedExpired,
  };
}

