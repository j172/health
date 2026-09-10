import { load } from "cheerio";
import { httpGetText } from "@/lib/server/net/httpClient";
import { withConnection, utcNowSql, withTransaction } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { toAbsoluteUrl } from "@/lib/server/rss/scraperUtils";
import { extractCity } from "./ingestShows";

const BASE_URL = "https://www.npo.org.tw";
const ACTIVITY_LIST_URL = `${BASE_URL}/activitylist.aspx?tid=128`;

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export interface IngestNpoActivitiesResult {
  totalFetched: number;
  insertedOrUpdated: number;
  errorMessage: string | null;
}

export async function runNpoActivitiesSync(): Promise<IngestNpoActivitiesResult> {
  try {
    const listRes = await httpGetText(ACTIVITY_LIST_URL, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 15_000,
    });

    if (listRes.status < 200 || listRes.status >= 300) {
      return { totalFetched: 0, insertedOrUpdated: 0, errorMessage: `HTTP ${listRes.status}` };
    }

    const $ = load(listRes.text);
    const activityCards = $(".square-list a").toArray();
    if (activityCards.length === 0) {
      return { totalFetched: 0, insertedOrUpdated: 0, errorMessage: null };
    }

    interface ParsedActivity {
      uid: string;
      title: string;
      startDate: string | null;
      endDate: string | null;
      description: string | null;
      imageUrl: string | null;
      sourceWebPromote: string;
      detailPath: string;
      masterUnit: string | null;
      city: string | null;
      location: string | null;
      locationName: string | null;
    }

    const activities: ParsedActivity[] = [];
    const seenUids = new Set<string>();

    for (const card of activityCards) {
      const href = $(card).attr("href") || "";
      const match = href.match(/location\.href='([^']+)'/);
      if (!match) continue;

      const detailPath = match[1];
      const sernoMatch = detailPath.match(/serno=(\d+)/);
      if (!sernoMatch) continue;

      const serno = sernoMatch[1];
      const uid = `npo_${serno}`;
      if (seenUids.has(uid)) continue;
      seenUids.add(uid);

      const title = $(card).find("h3").text().trim();
      if (!title) continue;

      const dateStr = $(card).find(".date").text().trim();
      let startDate: string | null = null;
      let endDate: string | null = null;
      if (dateStr.includes("~")) {
        const parts = dateStr.split("~").map((s) => s.trim());
        startDate = parts[0] ? parts[0].replace(/-/g, "/") : null;
        endDate = parts[1] ? parts[1].replace(/-/g, "/") : null;
      } else if (dateStr) {
        startDate = dateStr.replace(/-/g, "/");
        endDate = dateStr.replace(/-/g, "/");
      }

      const desc = $(card).find("p").text().trim() || null;
      const rawImg = $(card).find("img").attr("src");
      const imageUrl = rawImg ? toAbsoluteUrl(BASE_URL, rawImg) : null;
      const sourceWebPromote = toAbsoluteUrl(BASE_URL, detailPath);

      activities.push({
        uid,
        title,
        startDate,
        endDate,
        description: desc,
        imageUrl,
        sourceWebPromote,
        detailPath,
        masterUnit: null,
        city: null,
        location: null,
        locationName: null,
      });
    }

    // Enrich top 30 activities with details from orgactivity.aspx (for location/masterUnit)
    for (const act of activities.slice(0, 30)) {
      try {
        const detailRes = await httpGetText(act.sourceWebPromote, {
          headers: DEFAULT_HEADERS,
          timeoutMs: 8_000,
        });
        if (detailRes.status >= 200 && detailRes.status < 300) {
          const $d = load(detailRes.text);
          const orgName = $d(".profile h3").first().text().trim() || null;
          act.masterUnit = orgName;
          act.locationName = orgName;

          let address: string | null = null;
          $d(".profile h3").each((_, h) => {
            const txt = $d(h).text().trim();
            if (txt.includes("地址：") || txt.includes("地址:")) {
              address = txt.replace(/^地址[：:]\s*/, "").trim();
            }
          });

          if (address) {
            act.location = address;
            act.city = extractCity(address, orgName || "") || null;
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
      errorMessage: err.message || "Unknown NPO activities sync error",
    };
  }
}
