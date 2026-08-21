import "server-only";
import { httpRequest } from "@/lib/server/net/httpClient";

/**
 * 經濟部水利署 (WRA) 枯旱限水通報 open-data client.
 *
 * See docs/specs/phase5-wra-drought-alerts.md. This is a historical bulletin log
 * going back to 2012, not a CAP feed — there are no effective/expires fields, so
 * "currently in effect" is derived from the latest 通報日期 per reservoir rather
 * than read off the record.
 */

export const WRA_DROUGHT_RESOURCE_ID = "51ea7202-18fd-46e3-adae-4d05bc827a28";

export const WRA_DROUGHT_URL = `https://opendata.wra.gov.tw/api/v2/${WRA_DROUGHT_RESOURCE_ID}?sort=_importdate%20asc&format=JSON`;

/** One bulletin row, with the WRA field names normalized to ASCII. */
export interface WraDroughtRecord {
  /** 通報日期 — the bulletin's own date, as published (not a sync timestamp). */
  reportDate: string;
  /** 預警水情 — e.g. 綠燈/黃燈/橙燈/紅燈. */
  alertLevel: string;
  /** 水庫名稱 — the grouping key; one active bulletin per reservoir. */
  reservoirName: string;
  /** 供水區 */
  supplyArea: string;
  /** 標題 */
  title: string;
}

const text = (value: unknown): string =>
  value == null ? "" : String(value).trim();

/**
 * WRA's v2 API has wrapped its payload in a few different envelope shapes over
 * time (a bare array, `{ responseData: [...] }`, `{ data: [...] }`). Accept any
 * of them rather than breaking the daily sync on a cosmetic API change.
 */
const extractRows = (parsed: unknown): unknown[] => {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of ["responseData", "data", "result", "records"]) {
      const candidate = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) return candidate;
      // `{ result: { records: [...] } }`
      if (candidate && typeof candidate === "object") {
        const nested = (candidate as Record<string, unknown>).records;
        if (Array.isArray(nested)) return nested;
      }
    }
  }
  return [];
};

/**
 * Thrown when the endpoint answers with a bot-defence interstitial instead of data.
 *
 * As of 2026-08-21 opendata.wra.gov.tw sits behind an F5 Shape/BIG-IP JS
 * challenge: it answers a plain server-side request with HTTP 200,
 * `Content-Type: text/html`, and a `bobcmn`/`TSPD` JavaScript challenge page.
 * No amount of retrying fixes that from a server — it needs either an
 * allowlisted source address, a credentialed WRA API route, or a mirror of the
 * dataset. Surfacing it as its own error keeps the daily cron log honest instead
 * of reporting a confusing JSON parse failure.
 */
export class WraFeedBlockedError extends Error {
  constructor() {
    super(
      "WRA open-data returned a bot-protection challenge page instead of JSON. " +
        "The endpoint needs an allowlisted address, an API credential, or a mirror.",
    );
    this.name = "WraFeedBlockedError";
  }
}

export const fetchWraDroughtRecords = async (): Promise<WraDroughtRecord[]> => {
  const response = await httpRequest(WRA_DROUGHT_URL, {
    timeoutMs: 20_000,
    headers: { Accept: "application/json" },
  });

  if (response.status !== 200) {
    throw new Error(`WRA drought feed returned HTTP ${response.status}`);
  }

  const body = response.buffer.toString("utf-8");
  const contentType = String(response.headers["content-type"] ?? "");

  if (contentType.includes("text/html") || /^\s*<(!doctype|html)/i.test(body)) {
    throw new WraFeedBlockedError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new Error(
      `WRA drought feed returned unparseable JSON (${body.length} bytes, content-type "${contentType}")`,
    );
  }

  return extractRows(parsed)
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        reportDate: text(record["通報日期"]),
        alertLevel: text(record["預警水情"]),
        reservoirName: text(record["水庫名稱"]),
        supplyArea: text(record["供水區"]),
        title: text(record["標題"]),
      };
    })
    .filter(
      (record) => record.reservoirName !== "" && record.reportDate !== "",
    );
};

/**
 * Reduces the full historical log to the single most recent bulletin per
 * reservoir — the set the widget should treat as currently in effect.
 *
 * Dates are compared as strings after normalizing separators, because WRA has
 * published both `YYYY-MM-DD` and `YYYY/MM/DD` in this field; both are
 * zero-padded and fixed-width, so lexical order is chronological order.
 */
export const latestRecordPerReservoir = (
  records: WraDroughtRecord[],
): WraDroughtRecord[] => {
  const latest = new Map<string, WraDroughtRecord>();
  const sortKey = (record: WraDroughtRecord) =>
    record.reportDate.replace(/\//g, "-");

  for (const record of records) {
    const existing = latest.get(record.reservoirName);
    if (!existing || sortKey(record) > sortKey(existing)) {
      latest.set(record.reservoirName, record);
    }
  }

  return [...latest.values()].sort((a, b) =>
    a.reservoirName.localeCompare(b.reservoirName, "zh-Hant"),
  );
};
