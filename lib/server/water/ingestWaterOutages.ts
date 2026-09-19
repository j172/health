import { httpGetText } from "@/lib/server/net/httpClient";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { parseWraCsv } from "@/lib/server/water/wraCsvParser";

const WATER_OFF_URL = "https://web.water.gov.tw/wateroffapi/openData/export/csv-utf8";

function parseSqlDateTime(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export async function runWaterOutagesSync(): Promise<{
  totalFetched: number;
  insertedOrUpdated: number;
}> {
  const { status, text } = await httpGetText(WATER_OFF_URL, {
    timeoutMs: 25000,
    headers: {
      Accept: "text/csv, text/plain, */*",
    },
  });

  if (status < 200 || status >= 300 || !text) {
    throw new Error(`Water outage CSV download failed with status ${status}`);
  }

  const records = parseWraCsv(text);
  if (records.length === 0) {
    return { totalFetched: 0, insertedOrUpdated: 0 };
  }

  const now = Date.now();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const nowSql = utcNowSql();

  const values = records
    .map((r, idx) => {
      const caseNo = r["停水案號"] || r["CaseNo"] || `case_${idx}`;
      const startTimeStr = r["開始時間"] || r["StartDate"] || r["startTime"] || "";
      const endTimeStr = r["結束時間"] || r["EndDate"] || r["endTime"] || "";
      const publishTimeStr = r["發布時間"] || r["PublishDate"] || r["publishTime"] || startTimeStr;

      const startTime = new Date(startTimeStr).getTime();
      const endTime = new Date(endTimeStr).getTime();
      const publishTime = new Date(publishTimeStr).getTime();

      const isActive = !isNaN(startTime) && !isNaN(endTime) && now >= startTime && now <= endTime;
      const isRecentPublish = !isNaN(publishTime) && Math.abs(now - publishTime) <= oneWeekMs;
      const isUpcomingWeek = !isNaN(startTime) && startTime >= now && startTime - now <= oneWeekMs;
      const isWithinOneWeek = isActive || isRecentPublish || isUpcomingWeek ? 1 : 0;

      const startSql = parseSqlDateTime(startTimeStr);
      const endSql = parseSqlDateTime(endTimeStr);

      return [
        `water_${caseNo}`,
        publishTimeStr,
        startSql,
        endSql,
        r["停水類型"] || r["Type"] || "計畫停水",
        r["縣市"] || r["City"] || "",
        r["行政區"] || r["District"] || null,
        r["停水原因"] || r["Reason"] || null,
        r["停水範圍"] || r["停水區域"] || r["Area"] || null,
        r["所屬營運所"] || r["Station"] || null,
        isWithinOneWeek,
        nowSql,
        nowSql,
      ];
    })
    .filter(Boolean);

  let processedCount = 0;
  const BATCH_SIZE = 100;

  await withConnection(async (conn) => {
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const chunk = values.slice(i, i + BATCH_SIZE);
      await conn.query(
        `INSERT INTO water_outages (
           id, publish_time, start_time, end_time, outage_type, county,
           districts, reason, influence_area, supply_station, is_within_one_week,
           created_at, updated_at
         ) VALUES ?
         ON DUPLICATE KEY UPDATE
           publish_time = VALUES(publish_time),
           start_time = VALUES(start_time),
           end_time = VALUES(end_time),
           outage_type = VALUES(outage_type),
           county = VALUES(county),
           districts = VALUES(districts),
           reason = VALUES(reason),
           influence_area = VALUES(influence_area),
           supply_station = VALUES(supply_station),
           is_within_one_week = VALUES(is_within_one_week),
           updated_at = VALUES(updated_at)`,
        [chunk]
      );
      processedCount += chunk.length;
    }
  });

  return { totalFetched: records.length, insertedOrUpdated: processedCount };
}

