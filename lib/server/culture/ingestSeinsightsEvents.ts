import { httpGetText } from "@/lib/server/net/httpClient";
import { withConnection, utcNowSql, withTransaction } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { extractCity } from "./ingestShows";

const BASE_URL = "https://www.seinsights.asia";
const EVENT_LIST_URL = `${BASE_URL}/event`;

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export interface IngestSeinsightsEventsResult {
  totalFetched: number;
  insertedOrUpdated: number;
  errorMessage: string | null;
}

export interface ParsedSeinsightsEvent {
  uid: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  imageUrl: string | null;
  sourceWebPromote: string;
  masterUnit: string;
  city: string | null;
  location: string;
  locationName: string;
}

export function parseNextDataFromHtml(html: string): any {
  const startTag = '<script id="__NEXT_DATA__" type="application/json">';
  const s = html.indexOf(startTag);
  if (s === -1) return null;
  const e = html.indexOf("</script>", s);
  if (e === -1) return null;
  const jsonStr = html.slice(s + startTag.length, e);
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export function extractEventLocationAndSummary(eventData: any): {
  description: string;
  location: string;
  locationName: string;
  city: string | null;
} {
  if (!eventData) {
    return {
      description: "",
      location: "線上活動 / 全國參與",
      locationName: "線上活動",
      city: null,
    };
  }

  let allText = "";
  if (typeof eventData.content === "string") {
    try {
      const parsed = JSON.parse(eventData.content);
      allText = (parsed?.blocks || [])
        .map((b: any) => b?.text || "")
        .filter(Boolean)
        .join("\n");
    } catch {
      allText = eventData.content;
    }
  } else if (eventData.content?.blocks) {
    allText = eventData.content.blocks
      .map((b: any) => b?.text || "")
      .filter(Boolean)
      .join("\n");
  }

  // Generate description (up to 300 chars)
  const cleanSummary = allText
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

  // Check physical location from text
  const locMatch = allText.match(/(?:活動地點|地點|場地|地址)[：:]\s*([^\r\n]+)/);
  let location = "";
  let locationName = "";
  let city: string | null = null;

  if (locMatch && locMatch[1]) {
    location = locMatch[1].trim();
    locationName = location.split(/[，(（]/)[0].trim() || location;
    city = extractCity(location, locationName) || null;
  }

  if (!city) {
    const fallbackCity = extractCity(allText, "");
    if (fallbackCity) {
      city = fallbackCity;
      if (!location) {
        location = fallbackCity;
        locationName = fallbackCity;
      }
    }
  }

  // If no physical address/city found or explicitly marked online
  if (!location || allText.includes("線上講座") || allText.includes("線上直播") || allText.includes("線上會議") || allText.includes("Webinar")) {
    if (!location || !city) {
      location = "線上活動 / 全國參與";
      locationName = "線上活動";
      city = null;
    }
  }

  return {
    description: cleanSummary,
    location,
    locationName,
    city,
  };
}

export async function runSeinsightsEventsSync(): Promise<IngestSeinsightsEventsResult> {
  try {
    const listRes = await httpGetText(EVENT_LIST_URL, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 15_000,
    });

    if (listRes.status < 200 || listRes.status >= 300) {
      return { totalFetched: 0, insertedOrUpdated: 0, errorMessage: `HTTP ${listRes.status}` };
    }

    const nextData = parseNextDataFromHtml(listRes.text);
    const rawEvents = nextData?.props?.pageProps?.eventsListInit || [];

    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      return { totalFetched: 0, insertedOrUpdated: 0, errorMessage: null };
    }

    const activities: ParsedSeinsightsEvent[] = [];
    const seenUids = new Set<string>();

    for (const raw of rawEvents) {
      if (!raw?.id || !raw?.name) continue;
      const uid = `seinsights_${raw.id}`;
      if (seenUids.has(uid)) continue;
      seenUids.add(uid);

      const title = String(raw.name).trim();
      const sourceWebPromote = `${BASE_URL}/event/${raw.id}`;
      const imageUrl = raw.heroImage?.resized?.w800 || raw.heroImage?.resized?.original || null;

      let startDate: string | null = null;
      if (raw.event_start) {
        try {
          startDate = new Date(raw.event_start).toISOString().slice(0, 10).replace(/-/g, "/");
        } catch {
          startDate = null;
        }
      }

      const masterUnit = raw.organization
        ? `社企流、${String(raw.organization).trim()}`
        : "社企流";

      activities.push({
        uid,
        title,
        startDate,
        endDate: startDate,
        description: title,
        imageUrl,
        sourceWebPromote,
        masterUnit,
        city: null,
        location: "線上活動 / 全國參與",
        locationName: "線上活動",
      });
    }

    // Fetch detail page for each event to enrich description and location
    for (const act of activities) {
      try {
        const detailRes = await httpGetText(act.sourceWebPromote, {
          headers: DEFAULT_HEADERS,
          timeoutMs: 8_000,
        });
        if (detailRes.status >= 200 && detailRes.status < 300) {
          const detailNextData = parseNextDataFromHtml(detailRes.text);
          const eventData = detailNextData?.props?.pageProps?.eventData;
          if (eventData) {
            const enriched = extractEventLocationAndSummary(eventData);
            if (enriched.description) {
              act.description = enriched.description;
            }
            act.location = enriched.location;
            act.locationName = enriched.locationName;
            act.city = enriched.city;

            if (eventData.event_end) {
              try {
                act.endDate = new Date(eventData.event_end).toISOString().slice(0, 10).replace(/-/g, "/");
              } catch {
                // keep current endDate
              }
            }
          }
        }
      } catch {
        // Fallback to basic list details
      }
    }

    const now = utcNowSql();
    let countProcessed = 0;

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
      errorMessage: err.message || "Unknown Seinsights activities sync error",
    };
  }
}
