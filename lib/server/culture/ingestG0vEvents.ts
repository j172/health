import { httpGetText } from "@/lib/server/net/httpClient";
import { withConnection, utcNowSql, withTransaction } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { extractCity } from "./ingestShows";

export interface G0vKktixSource {
  name: string;
  url: string;
}

export const G0V_KKTIX_SOURCES: G0vKktixSource[] = [
  {
    name: "g0v 零時政府揪松團",
    url: "https://g0v-jothon.kktix.cc/events.json",
  },
  {
    name: "Cofacts 真的假的",
    url: "https://cofacts.kktix.cc/events.json",
  },
];

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/html,*/*;q=0.8",
};

export interface IngestG0vEventsResult {
  totalFetched: number;
  insertedOrUpdated: number;
  errorMessage: string | null;
}

export interface ParsedG0vEvent {
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
}

export function parseKktixEventEntry(
  entry: any,
  fallbackMasterUnit = "g0v 零時政府"
): ParsedG0vEvent | null {
  if (!entry || !entry.url || !entry.title) return null;

  const url = String(entry.url).trim();
  const slugMatch = url.match(/\/events\/([^/?#]+)/);
  const slug = slugMatch ? slugMatch[1] : Buffer.from(url).toString("hex").slice(0, 16);
  const uid = `g0v_kktix_${slug}`;

  const title = String(entry.title).trim();
  const content = String(entry.content || "");
  const summary = String(entry.summary || "").trim();
  const description = summary || content.slice(0, 250) || title;

  // Extract dates from content (e.g. "時間：2026/05/31 10:30(+0800)~17:30" or "時間：2026-05-31")
  let startDate: string | null = null;
  let endDate: string | null = null;

  const timeMatch = content.match(/(?:時間|日期)[：:]\s*([0-9]{4}[/.-][0-9]{1,2}[/.-][0-9]{1,2})/);
  if (timeMatch && timeMatch[1]) {
    startDate = timeMatch[1].replace(/-/g, "/").replace(/\./g, "/");
    endDate = startDate;

    const rangeMatch = content.match(/(?:時間|日期)[：:][^~]+~\s*([0-9]{4}[/.-][0-9]{1,2}[/.-][0-9]{1,2})/);
    if (rangeMatch && rangeMatch[1]) {
      endDate = rangeMatch[1].replace(/-/g, "/").replace(/\./g, "/");
    }
  } else if (entry.published) {
    try {
      startDate = new Date(entry.published).toISOString().slice(0, 10).replace(/-/g, "/");
      endDate = startDate;
    } catch {
      startDate = null;
      endDate = null;
    }
  }

  // Extract location from content (e.g. "地點：g0v 台北社群空間 / 台北市中正區重慶南路三段2號")
  let location = "";
  let locationName = "";
  let city: string | null = null;

  const locMatch = content.match(/(?:活動地點|地點|場地|地址)[：:]\s*([^\r\n]+)/);
  if (locMatch && locMatch[1]) {
    const rawLoc = locMatch[1].trim();
    // Split by slash if bilingual/venue + address separated
    const parts = rawLoc.split("/").map((s) => s.trim()).filter(Boolean);
    locationName = parts[0] || rawLoc;
    location = rawLoc;
    city = extractCity(location, locationName) || null;
  }

  // Fallback for online events or missing address
  if (!location || location.includes("線上") || location.includes("Webinar") || title.includes("線上")) {
    if (!city) {
      location = "線上活動 / 全國參與";
      locationName = "線上活動";
      city = null;
    }
  }

  const masterUnit = entry.author?.name ? String(entry.author.name).trim() : fallbackMasterUnit;

  return {
    uid,
    title,
    startDate,
    endDate,
    description,
    imageUrl: null,
    sourceWebPromote: url,
    masterUnit,
    city,
    location,
    locationName,
  };
}

export async function runG0vEventsSync(): Promise<IngestG0vEventsResult> {
  try {
    const allActivities: ParsedG0vEvent[] = [];
    const seenUids = new Set<string>();

    for (const source of G0V_KKTIX_SOURCES) {
      try {
        const res = await httpGetText(source.url, {
          headers: DEFAULT_HEADERS,
          timeoutMs: 15_000,
        });

        if (res.status < 200 || res.status >= 300) continue;

        let data: any;
        try {
          data = JSON.parse(res.text);
        } catch {
          continue;
        }

        const entries = Array.isArray(data?.entry) ? data.entry : [];
        for (const entry of entries.slice(0, 30)) {
          const parsed = parseKktixEventEntry(entry, source.name);
          if (!parsed) continue;
          if (seenUids.has(parsed.uid)) continue;
          seenUids.add(parsed.uid);
          allActivities.push(parsed);
        }
      } catch (srcErr) {
        console.warn(`[g0v Sync] Error fetching source ${source.name}:`, srcErr);
      }
    }

    if (allActivities.length === 0) {
      return { totalFetched: 0, insertedOrUpdated: 0, errorMessage: null };
    }

    const now = utcNowSql();
    let countProcessed = 0;

    for (const ev of allActivities) {
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
      totalFetched: allActivities.length,
      insertedOrUpdated: countProcessed,
      errorMessage: null,
    };
  } catch (err: any) {
    return {
      totalFetched: 0,
      insertedOrUpdated: 0,
      errorMessage: err.message || "Unknown g0v events sync error",
    };
  }
}
