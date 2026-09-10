import { load } from "cheerio";
import { httpGetText } from "@/lib/server/net/httpClient";
import { withConnection, utcNowSql, withTransaction } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";

const PRESIDENTIAL_VISIT_URL = "https://www.president.gov.tw/Page/124";
const UID = "gov_president_office_visit";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export interface IngestPresidentialVisitResult {
  success: boolean;
  title: string;
  weekendDatesCount: number;
  errorMessage: string | null;
}

export async function runPresidentialVisitSync(): Promise<IngestPresidentialVisitResult> {
  try {
    const res = await httpGetText(PRESIDENTIAL_VISIT_URL, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 15_000,
    });

    let html = "";
    if (res.status >= 200 && res.status < 300) {
      html = res.text;
    }

    const $ = load(html || "<html></html>");
    const title = "中華民國總統府 常態開放參觀與國定古蹟建築展覽";
    const description = [
      "【開放參觀須知】",
      "1. 總統府為國定古蹟，開放參觀完全免費，歡迎國內外民眾蒞臨參觀。",
      "2. 個人參觀（未滿15人）：不需網路預約，請於參觀時間內由寶慶路與博愛路口排隊經安全檢查後入府。",
      "3. 團體參觀（15人以上）：請於參觀日3天前至總統府官方網站辦理網路預約。",
      "4. 平日開放時間：每星期一至星期五 上午 09:00 ~ 12:00（請於11:30前排隊入府）。",
      "5. 假日開放時間：特定週六大開放日 上午 09:00 ~ 下午 16:00（全區敞廳、大禮堂、南北苑花園完整參觀）。",
      "6. 洽詢專線：(02)2320-6921、(02)2320-6347。",
    ].join("\n");

    // Extract upcoming weekend open house dates from the official page
    const weekendDates: string[] = [];
    $("div, p, td, li").each((_, el) => {
      const text = $(el).text().replace(/[ \t]+/g, " ").trim();
      const matches = text.match(/(\d{1,2})月(\d{1,2})日[（(]星期[六日一二三四五][）)]/g);
      if (matches) {
        for (const m of matches) {
          const dm = m.match(/(\d{1,2})月(\d{1,2})日/);
          if (dm) {
            const currentYear = new Date().getFullYear();
            const month = dm[1].padStart(2, "0");
            const day = dm[2].padStart(2, "0");
            const dateStr = `${currentYear}-${month}-${day}`;
            if (!weekendDates.includes(dateStr)) {
              weekendDates.push(dateStr);
            }
          }
        }
      }
    });

    const nowYear = new Date().getFullYear();
    const startDate = `${nowYear}-01-01`;
    const endDate = `${nowYear}-12-31`;

    await withTransaction(async (conn) => {
      // 1. Upsert into cultural_events
      const [existing] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM cultural_events WHERE uid = ?",
        [UID],
      );

      let eventId: number;
      if (existing.length > 0) {
        eventId = existing[0].id;
        await conn.query(
          `UPDATE cultural_events SET
            category = 'exhibition',
            title = ?,
            description = ?,
            image_url = 'https://www.president.gov.tw/Portals/0/fb.png',
            source_url = ?,
            city = '臺北市',
            venue = '中華民國總統府',
            price = '完全免費 (Free)',
            start_date = ?,
            end_date = ?,
            synced_at = ${utcNowSql()},
            updated_at = ${utcNowSql()}
           WHERE id = ?`,
          [title, description, PRESIDENTIAL_VISIT_URL, startDate, endDate, eventId],
        );
      } else {
        const [insertRes] = await conn.query<any>(
          `INSERT INTO cultural_events (
            uid, category, title, description, image_url, source_url,
            city, venue, price, start_date, end_date,
            synced_at, created_at, updated_at
          ) VALUES (
            ?, 'exhibition', ?, ?, 'https://www.president.gov.tw/Portals/0/fb.png', ?,
            '臺北市', '中華民國總統府', '完全免費 (Free)', ?, ?,
            ${utcNowSql()}, ${utcNowSql()}, ${utcNowSql()}
          )`,
          [UID, title, description, PRESIDENTIAL_VISIT_URL, startDate, endDate],
        );
        eventId = insertRes.insertId;
      }

      // 2. Clear and refresh shows in cultural_event_shows
      await conn.query("DELETE FROM cultural_event_shows WHERE event_id = ?", [eventId]);

      // Add regular weekday permanent show
      await conn.query(
        `INSERT INTO cultural_event_shows (
          event_id, show_time, venue, address, city, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ${utcNowSql()}, ${utcNowSql()})`,
        [
          eventId,
          `${startDate} 09:00:00`,
          "中華民國總統府（平日 09:00~12:00 免費參觀）",
          "臺北市中正區重慶南路一段122號",
          "臺北市",
        ],
      );

      // Add specific weekend open house shows
      for (const wDate of weekendDates.slice(0, 12)) {
        await conn.query(
          `INSERT INTO cultural_event_shows (
            event_id, show_time, venue, address, city, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ${utcNowSql()}, ${utcNowSql()})`,
          [
            eventId,
            `${wDate} 09:00:00`,
            "中華民國總統府（假日大開放日 09:00~16:00）",
            "臺北市中正區重慶南路一段122號",
            "臺北市",
          ],
        );
      }
    });

    return {
      success: true,
      title,
      weekendDatesCount: weekendDates.length,
      errorMessage: null,
    };
  } catch (error: any) {
    console.error("[Presidential Visit] Sync failed:", error);
    return {
      success: false,
      title: "中華民國總統府 常態開放參觀與國定古蹟建築展覽",
      weekendDatesCount: 0,
      errorMessage: error.message,
    };
  }
}
