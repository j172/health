import { NextResponse } from "next/server";
import { httpGetText } from "@/lib/server/net/httpClient";

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 minutes

export interface WaterOutageItem {
  id: string;
  publishTime: string;
  startTime: string;
  endTime: string;
  type: string;
  county: string;
  districts: string;
  reason: string;
  influenceArea: string;
  supplyStation: string;
  isWithinOneWeek: boolean;
}

function parseCsv(text: string): Record<string, string>[] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inQuotes) {
      if (char === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += char;
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r") {
      // skip
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const nonEmptyRows = rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
  if (nonEmptyRows.length === 0) return [];
  const headers = nonEmptyRows[0].map((h) => h.trim());
  return nonEmptyRows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => (record[h] = (cells[i] ?? "").trim()));
    return record;
  });
}

const WATER_OFF_URL = "https://web.water.gov.tw/wateroffapi/openData/export/csv-utf8";

export async function GET() {
  try {
    const { status, text } = await httpGetText(WATER_OFF_URL, {
      timeoutMs: 12000,
      headers: {
        Accept: "text/csv, text/plain, */*",
      },
    });

    if (status < 200 || status >= 300 || !text) {
      return NextResponse.json({ ok: false, outages: [] }, { status: 200 });
    }

    const records = parseCsv(text);
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    const outages: WaterOutageItem[] = [];

    records.forEach((r, idx) => {
      const startTimeStr = r["開始時間"] || r["StartDate"] || r["startTime"] || "";
      const endTimeStr = r["結束時間"] || r["EndDate"] || r["endTime"] || "";
      const publishTimeStr = r["發布時間"] || r["PublishDate"] || r["publishTime"] || startTimeStr;

      const startTime = new Date(startTimeStr).getTime();
      const endTime = new Date(endTimeStr).getTime();
      const publishTime = new Date(publishTimeStr).getTime();

      // Check if it's within 1 week (either published in last 7 days or scheduled within next 7 days or currently active)
      const isActive = !isNaN(startTime) && !isNaN(endTime) && now >= startTime && now <= endTime;
      const isRecentPublish = !isNaN(publishTime) && Math.abs(now - publishTime) <= oneWeekMs;
      const isUpcomingWeek = !isNaN(startTime) && startTime >= now && startTime - now <= oneWeekMs;

      const isWithinOneWeek = isActive || isRecentPublish || isUpcomingWeek;

      if (isWithinOneWeek) {
        outages.push({
          id: `water_${r["停水案號"] || r["CaseNo"] || idx}`,
          publishTime: publishTimeStr,
          startTime: startTimeStr,
          endTime: endTimeStr,
          type: r["停水類型"] || r["Type"] || "計畫停水",
          county: r["縣市"] || r["City"] || "",
          districts: r["行政區"] || r["District"] || "",
          reason: r["停水原因"] || r["Reason"] || "",
          influenceArea: r["停水範圍"] || r["停水區域"] || r["Area"] || "",
          supplyStation: r["所屬營運所"] || r["Station"] || "",
          isWithinOneWeek: true,
        });
      }
    });

    // Sort by startTime descending
    outages.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    return NextResponse.json({
      ok: true,
      totalCount: outages.length,
      outages: outages.slice(0, 50),
    });
  } catch (error) {
    console.error("GET /api/water-outages error:", error);
    return NextResponse.json({ ok: false, outages: [] }, { status: 200 });
  }
}

