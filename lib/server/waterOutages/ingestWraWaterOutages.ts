import { httpGetText } from "@/lib/server/net/httpClient";
import { withConnection } from "@/lib/server/db/mysql";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { parseWraCsv } from "@/lib/server/water/wraCsvParser";

// Same endpoint the legacy `water_outages` pipeline
// (lib/server/water/ingestWaterOutages.ts) already polls successfully — see
// docs/specs/water-outages-live-ingestion-gap.md. This is the ingestion the
// `/tools/water-outages` page (table `wra_water_outages`) never had: without
// it that table stays empty forever and every request falls back to
// WATER_OUTAGES_SEED.
const WRA_WATER_OUTAGE_CSV_URL =
  "https://web.water.gov.tw/wateroffapi/openData/export/csv-utf8";

export type WraOutageType = "planned" | "emergency";
export type WraOutageStatus = "active" | "scheduled" | "resolved";

export interface MappedWraOutage {
  outageId: string;
  title: string;
  county: string;
  township: string;
  outageType: WraOutageType;
  /** MySQL DATETIME literal, Taipei wall-clock (same convention as lib/server/wra/*). */
  startTime: string;
  /** MySQL DATETIME literal, Taipei wall-clock. */
  endTime: string;
  affectedAreas: string;
  affectedHouseholds: number;
  contactPhone: string | null;
  status: WraOutageStatus;
  source: string;
}

/** Trims a CSV cell and treats the literal string "null" (WRA ships this for blank cells) as empty. */
const cleanCell = (raw: string | undefined): string => {
  const s = (raw ?? "").trim();
  return s.toLowerCase() === "null" ? "" : s;
};

// WRA ships "案件日期時間"/"恢復日期時間" as "2026-09-19 14:00:00" — already
// Taipei local time with no timezone suffix, same convention every other
// *_at column in this repo follows (see lib/server/wra/fetchWaterLevelStations.ts).
// Normalizes to a MySQL DATETIME literal, or null if blank/unparseable.
const toMysqlDatetime = (raw: string | undefined): string | null => {
  const s = cleanCell(raw).replace("T", " ");
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) ? s.slice(0, 19) : null;
};

/** Inverse of parseTaipeiDateToUtc: a real UTC instant -> a Taipei wall-clock MySQL DATETIME literal. */
const utcMsToTaipeiSql = (utcMs: number): string =>
  new Date(utcMs + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

const parseHouseholds = (raw: string | undefined): number => {
  const digits = cleanCell(raw).replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
};

function deriveStatus(startSql: string, endSql: string, nowMs: number): WraOutageStatus {
  const startMs = parseTaipeiDateToUtc(startSql)?.getTime();
  const endMs = parseTaipeiDateToUtc(endSql)?.getTime();
  if (typeof endMs === "number" && nowMs >= endMs) return "resolved";
  if (typeof startMs === "number" && nowMs < startMs) return "scheduled";
  return "active";
}

/**
 * Maps one record already parsed by parseWraCsv() into the shape
 * runWraWaterOutagesSync() upserts into `wra_water_outages`. Exported
 * separately so field-mapping + status derivation can be unit-tested
 * without a live DB/network dependency.
 *
 * Returns null for rows missing what we can't do without — an affected
 * county or a usable start time — which WRA's feed occasionally ships as
 * blank trailing rows.
 */
export function mapWraCsvRecordToOutage(
  record: Record<string, string>,
  idx: number,
  nowMs: number = Date.now(),
): MappedWraOutage | null {
  const caseNo = cleanCell(record["案件編號"]) || `wra_${idx}`;
  const county = cleanCell(record["影響縣市"]);
  const township = cleanCell(record["影響行政區"]);
  const startSql = toMysqlDatetime(record["案件日期時間"]);
  if (!county || !startSql) return null;

  // `end_time` is NOT NULL on wra_water_outages (unlike the legacy
  // water_outages.end_time, which allows NULL) — WRA sometimes hasn't
  // published a restore estimate yet ("恢復日期時間" blank/"null"), so fall
  // back to start + 24h rather than dropping the row.
  let endSql = toMysqlDatetime(record["恢復日期時間"]);
  if (!endSql) {
    const startUtcMs = parseTaipeiDateToUtc(startSql)?.getTime() ?? nowMs;
    endSql = utcMsToTaipeiSql(startUtcMs + 24 * 60 * 60 * 1000);
  }

  const attribute = cleanCell(record["屬性"]); // "計畫性" | "非計畫性"
  const outageTypeLabel = cleanCell(record["停水類型"]); // e.g. "破管搶修", "配管工程"
  const outageType: WraOutageType =
    attribute === "非計畫性" || /搶修|緊急|突發/.test(outageTypeLabel) ? "emergency" : "planned";

  const affectedAreas = cleanCell(record["停水地區"]) || [county, township].filter(Boolean).join("");

  const title = `${outageTypeLabel || (outageType === "emergency" ? "緊急搶修" : "計畫")}停水（${county}${township}）`;

  const stationLabel = [cleanCell(record["區處"]), cleanCell(record["廠所"])]
    .filter(Boolean)
    .join("");

  return {
    outageId: `WRA-${caseNo}`,
    title,
    county,
    township,
    outageType,
    startTime: startSql,
    endTime: endSql,
    affectedAreas,
    affectedHouseholds: parseHouseholds(record["停水戶數"]),
    contactPhone: cleanCell(record["連絡電話"]) || null,
    status: deriveStatus(startSql, endSql, nowMs),
    source: stationLabel || "台灣自來水公司",
  };
}

export interface WraWaterOutagesSyncSummary {
  totalFetched: number;
  insertedOrUpdated: number;
  skipped: number;
}

export async function runWraWaterOutagesSync(): Promise<WraWaterOutagesSyncSummary> {
  const { status, text } = await httpGetText(WRA_WATER_OUTAGE_CSV_URL, {
    timeoutMs: 25000,
    headers: {
      Accept: "text/csv, text/plain, */*",
    },
  });

  if (status < 200 || status >= 300 || !text) {
    throw new Error(`WRA water outage CSV download failed with status ${status}`);
  }

  const records = parseWraCsv(text);
  if (records.length === 0) {
    return { totalFetched: 0, insertedOrUpdated: 0, skipped: 0 };
  }

  const nowMs = Date.now();
  const mapped = records
    .map((r, idx) => mapWraCsvRecordToOutage(r, idx, nowMs))
    .filter((r): r is MappedWraOutage => r !== null);
  const skipped = records.length - mapped.length;

  if (mapped.length === 0) {
    return { totalFetched: records.length, insertedOrUpdated: 0, skipped };
  }

  const values = mapped.map((o) => [
    o.outageId,
    o.title,
    o.county,
    o.township,
    o.outageType,
    o.startTime,
    o.endTime,
    o.affectedAreas,
    o.affectedHouseholds,
    o.contactPhone,
    o.status,
    o.source,
  ]);

  let processedCount = 0;
  const BATCH_SIZE = 100;

  await withConnection(async (conn) => {
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const chunk = values.slice(i, i + BATCH_SIZE);
      await conn.query(
        `INSERT INTO wra_water_outages (
           outage_id, title, county, township, outage_type, start_time, end_time,
           affected_areas, affected_households, contact_phone, status, source
         ) VALUES ?
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           county = VALUES(county),
           township = VALUES(township),
           outage_type = VALUES(outage_type),
           start_time = VALUES(start_time),
           end_time = VALUES(end_time),
           affected_areas = VALUES(affected_areas),
           affected_households = VALUES(affected_households),
           contact_phone = VALUES(contact_phone),
           status = VALUES(status),
           source = VALUES(source),
           updated_at = NOW()`,
        [chunk],
      );
      processedCount += chunk.length;
    }
  });

  return { totalFetched: records.length, insertedOrUpdated: processedCount, skipped };
}
