import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv } from "@/lib/server/facilities/csv";
import { normalizeClock, weekdayMaskFromFlags } from "@/lib/tools/garbageTrucks/schedule";
import type { GarbageRouteStopRecord } from "@/lib/server/garbageRoutes/types";
import {
  assertHeaderColumns,
  collapseLineBreaks,
  parseCoordinates,
  textOrNull,
} from "@/lib/server/garbageRoutes/sources/shared";

// 新北市垃圾車路線 — data.gov.tw dataset 125664 (新北市政府資料開放平臺).
// One CSV row per scheduled stop; `city` is actually the district ("萬里區"):
//   city,lineid,linename,rank,name,village,longitude,latitude,time,memo,
//   garbage{sunday..saturday}, recycling{sunday..saturday}, foodscraps{sunday..saturday}
// The 21 weekday columns are 'Y' or empty (一般垃圾／資源回收／廚餘 x 週日至週六).
//
// Measured 2026-10-15: 26,574 records in 648 lines. The file has 26,583 physical
// lines — the 9-line difference is newlines *inside* quoted cells (stop names such as
// "和平路57號⏎(路牌下收運後迴轉)" and a memo that is just a newline). The spec/issue's
// "26,583" is that physical line count; the record count — what lands in
// garbage_route_stops — is 26,574 and drifts as the city edits routes.
//
// `lineid` + `rank` is the natural key. Rows are not trusted to be unique, so a
// repeated (lineid, rank) keeps its first occurrence.
//
// Host: data.ntpc.gov.tw already serves live sources of this site; this resource path
// has not been probed from the production host — the first post-deploy sync is that
// probe.

const SOURCE_URL = "https://data.ntpc.gov.tw/api/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8/csv/file";

export const NTPC_125664_SOURCE_KEY = "garbage_ntpc_125664";

const REQUIRED_COLUMNS = ["city", "lineid", "linename", "rank", "name", "village", "longitude", "latitude", "time"] as const;

/** Column-name suffixes in Date#getDay() order (Sunday first). */
const DAY_SUFFIXES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const dayMask = (row: Record<string, string>, prefix: "garbage" | "recycling" | "foodscraps"): number =>
  weekdayMaskFromFlags(DAY_SUFFIXES.map((day) => (row[`${prefix}${day}`] ?? "").trim().toUpperCase() === "Y"));

/** Parses the 125664 CSV text into stop rows. Throws if the text is clearly not this CSV; skips unusable rows. */
export function parseNtpcRoutes(csvText: string): GarbageRouteStopRecord[] {
  assertHeaderColumns(csvText, REQUIRED_COLUMNS, "新北市垃圾車路線 (data.gov.tw 125664)");
  const rows = parseCsv(csvText);

  const seen = new Set<string>();
  const records: GarbageRouteStopRecord[] = [];

  for (const row of rows) {
    const lineId = textOrNull(row["lineid"]);
    const district = textOrNull(row["city"]);
    const stopName = collapseLineBreaks(row["name"]);
    if (!lineId || !district || stopName === "") continue;

    const rankText = (row["rank"] ?? "").trim();
    if (!/^\d+$/.test(rankText)) continue;
    const stopRank = Number(rankText);

    const coordinates = parseCoordinates(row["latitude"], row["longitude"]);
    if (!coordinates) continue;

    const key = `${lineId}|${stopRank}`;
    if (seen.has(key)) continue;
    seen.add(key);

    records.push({
      city: "new_taipei",
      lineId,
      stopRank,
      lineName: textOrNull(row["linename"]) ?? lineId,
      tripLabel: null,
      team: null,
      district,
      village: textOrNull(row["village"]),
      stopName,
      lat: coordinates.lat,
      lng: coordinates.lng,
      arriveTime: normalizeClock(row["time"]),
      departTime: null,
      garbageDays: dayMask(row, "garbage"),
      recyclingDays: dayMask(row, "recycling"),
      foodscrapsDays: dayMask(row, "foodscraps"),
      memo: textOrNull(collapseLineBreaks(row["memo"])),
    });
  }

  return records;
}

export async function fetchNtpcRoutes(): Promise<GarbageRouteStopRecord[]> {
  // Shared httpClient, never the global fetch() — undici's WASM parser OOMs on this host.
  const { status, text } = await httpGetText(SOURCE_URL, { timeoutMs: 90_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`新北市垃圾車路線 (125664) request failed: HTTP ${status}`);
  }
  return parseNtpcRoutes(text);
}
