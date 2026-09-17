import { httpGetText } from "@/lib/server/net/httpClient";
import { withConnection, utcNowSql, withTransaction } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { extractCity } from "./ingestShows";

export const KUMA_CITY_MAP: Record<number, string> = {
  1: "臺北市",
  2: "新北市",
  3: "基隆市",
  4: "桃園市",
  5: "新竹市",
  6: "新竹縣",
  7: "苗栗縣",
  8: "臺中市",
  9: "彰化縣",
  10: "南投縣",
  11: "雲林縣",
  12: "嘉義市",
  13: "嘉義縣",
  14: "臺南市",
  15: "高雄市",
  16: "屏東縣",
  17: "宜蘭縣",
  18: "花蓮縣",
  19: "臺東縣",
  20: "澎湖縣",
  21: "金門縣",
  22: "連江縣",
};

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

export interface IngestKumaEventsResult {
  totalFetched: number;
  insertedOrUpdated: number;
  errorMessage: string | null;
}

export interface ParsedKumaEvent {
  uid: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  description: string;
  imageUrl: string | null;
  sourceWebPromote: string;
  masterUnit: string;
  city: string | null;
  location: string;
  locationName: string;
  category: string;
  categoryLabel: string;
}

export function parseKumaSlotEntry(slot: any): ParsedKumaEvent | null {
  if (!slot || !slot.id) return null;

  const uid = `kuma_slot_${slot.id}`;
  const courseName = String(slot.course_in_person?.name || "黑熊學院課程").trim();
  const slotName = String(slot.name || "").trim();
  const title = slotName ? `${courseName}（${slotName}）` : courseName;

  const startDate = slot.event_time_start ? String(slot.event_time_start).trim() : null;
  const endDate = slot.event_time_end ? String(slot.event_time_end).trim() : startDate;

  // City resolution: lookup ID map first, fallback to extractCity from address_text
  let city: string | null = null;
  if (typeof slot.address_city === "number" && KUMA_CITY_MAP[slot.address_city]) {
    city = KUMA_CITY_MAP[slot.address_city];
  } else if (slot.address_text) {
    city = extractCity(String(slot.address_text), String(slot.address_name || "")) || null;
  }

  const locationName = String(slot.address_name || "黑熊學院").trim();
  let location = String(slot.address_text || locationName).trim();
  if (city && !location.startsWith(city) && !location.startsWith(city.replace("臺", "台"))) {
    location = `${city}${location}`;
  }

  // Categories and tags
  const catNames: string[] = [];
  if (slot.course_in_person?.type?.name) {
    catNames.push(String(slot.course_in_person.type.name).trim());
  }
  if (Array.isArray(slot.course_in_person?.category)) {
    for (const c of slot.course_in_person.category) {
      if (c?.name) catNames.push(String(c.name).trim());
    }
  }
  const tagSummary = catNames.filter(Boolean).join("、");

  const statusLabel =
    slot.status === "registration"
      ? "開放報名中"
      : slot.status === "full"
      ? "已額滿"
      : slot.status || "詳見官網";

  const description = `${courseName} - ${slotName}。類別：${tagSummary || "民防教育"}。地點：${location}。報名狀態：${statusLabel}。歡迎前往黑熊學院行事曆查詢最新梯次與報名名額。`;

  const imageUrl =
    slot.course_in_person?.image_url ||
    slot.course_in_person?.thumbnail_url ||
    null;

  return {
    uid,
    title,
    startDate,
    endDate,
    description,
    imageUrl,
    sourceWebPromote: "https://kuma-academy.org/calendar",
    masterUnit: "黑熊學院",
    city,
    location,
    locationName,
    category: "npo",
    categoryLabel: "🤝 公益活動",
  };
}

export async function runKumaEventsSync(): Promise<IngestKumaEventsResult> {
  const url = "https://api.kuma-academy.org/course_in_person_slots?is_show_on_calendar=1";

  try {
    const res = await httpGetText(url, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 15_000,
    });

    if (res.status < 200 || res.status >= 300) {
      return {
        totalFetched: 0,
        insertedOrUpdated: 0,
        errorMessage: `HTTP ${res.status} fetching Kuma calendar slots`,
      };
    }

    const json = JSON.parse(res.text);
    const rawSlots = Array.isArray(json?.data?.data) ? json.data.data : [];

    const activities: ParsedKumaEvent[] = [];
    for (const slot of rawSlots) {
      const parsed = parseKumaSlotEntry(slot);
      if (parsed) activities.push(parsed);
    }

    if (activities.length === 0) {
      return { totalFetched: 0, insertedOrUpdated: 0, errorMessage: null };
    }

    let countProcessed = 0;
    const now = utcNowSql();

    for (const ev of activities) {
      await withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO cultural_events (
             uid, title, category, category_label, description, image_url,
             master_unit, start_date, end_date, source_web_promote, web_sales,
             created_at, updated_at
           ) VALUES (?, ?, 'npo', '🤝 公益活動', ?, ?, ?, ?, ?, ?, NULL, ?, ?)
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
             updated_at = VALUES(updated_at)`,
          [
            ev.uid,
            ev.title,
            ev.description,
            ev.imageUrl,
            ev.masterUnit,
            ev.startDate,
            ev.endDate,
            ev.sourceWebPromote,
            now,
            now,
          ]
        );

        const [rows] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM cultural_events WHERE uid = ?",
          [ev.uid]
        );
        const eventId = rows[0]?.id;
        if (!eventId) return;

        await conn.execute(
          "DELETE FROM cultural_event_shows WHERE event_id = ?",
          [eventId]
        );

        await conn.execute(
          `INSERT INTO cultural_event_shows (
             event_id, show_time, location, location_name, city,
             on_sales, price, lat, lng, end_time, created_at
           ) VALUES (?, ?, ?, ?, ?, 'N', NULL, NULL, NULL, ?, ?)`,
          [
            eventId,
            ev.startDate,
            ev.location,
            ev.locationName || ev.masterUnit,
            ev.city,
            ev.endDate,
            now,
          ]
        );

        countProcessed++;
      });
    }

    return {
      totalFetched: activities.length,
      insertedOrUpdated: countProcessed,
      errorMessage: null,
    };
  } catch (err: any) {
    return {
      totalFetched: 0,
      insertedOrUpdated: 0,
      errorMessage: err.message || "Unknown Kuma events sync error",
    };
  }
}
