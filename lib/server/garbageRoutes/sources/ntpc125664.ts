import { httpGetText } from "@/lib/server/net/httpClient";
import { iterateCsvRows } from "@/lib/server/facilities/csv";
import { yieldToEventLoop } from "@/lib/server/sync/yieldToEventLoop";
import { normalizeClock, weekdayMaskFromFlags } from "@/lib/tools/garbageTrucks/schedule";
import type { GarbageRouteFetchHooks, GarbageRouteStopRecord } from "@/lib/server/garbageRoutes/types";
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
//
// Memory: this is the biggest CSV the sync handles (3.6 MB, 26.6k rows x 29 columns) and
// health-web runs under a 768 MB heap cap next to ~450 MB of other resident memory.
// Materialising it with parseCsv() (every row as a 29-key header-keyed object — V8 puts an
// object built by keyed stores like that into dictionary mode, ~1.7 KB each — plus the
// string[][] it was built from) cost about +140 MB of peak RSS and one ~170 ms unbroken
// stretch of synchronous work; the first production run of this sync restarted the web
// process right at this step (issue #674). So rows are streamed through iterateCsvRows,
// each one turned straight into the final record, and the loop hands the event loop back
// every PARSE_YIELD_EVERY_ROWS rows.

const SOURCE_URL = "https://data.ntpc.gov.tw/api/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8/csv/file";
const SOURCE_LABEL = "新北市垃圾車路線 (data.gov.tw 125664)";

export const NTPC_125664_SOURCE_KEY = "garbage_ntpc_125664";

const REQUIRED_COLUMNS = ["city", "lineid", "linename", "rank", "name", "village", "longitude", "latitude", "time"] as const;

/** Column-name suffixes in Date#getDay() order (Sunday first). */
const DAY_SUFFIXES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

/** The parser gives the event loop back after this many CSV rows (~3 ms of work on a dev machine). */
export const PARSE_YIELD_EVERY_ROWS = 500;

/** Position of each column of interest in the header row; -1 = the file has no such column. */
interface NtpcColumns {
  district: number;
  lineId: number;
  lineName: number;
  rank: number;
  stopName: number;
  village: number;
  lng: number;
  lat: number;
  time: number;
  memo: number;
  garbageDays: readonly number[];
  recyclingDays: readonly number[];
  foodscrapsDays: readonly number[];
}

const resolveColumns = (headerCells: readonly string[]): NtpcColumns => {
  // Later duplicates win, like assigning header-keyed object properties in order did.
  const position = new Map<string, number>();
  headerCells.forEach((name, index) => position.set(name.trim(), index));
  const at = (name: string): number => position.get(name) ?? -1;
  const days = (prefix: string): number[] => DAY_SUFFIXES.map((day) => at(`${prefix}${day}`));

  return {
    district: at("city"),
    lineId: at("lineid"),
    lineName: at("linename"),
    rank: at("rank"),
    stopName: at("name"),
    village: at("village"),
    lng: at("longitude"),
    lat: at("latitude"),
    time: at("time"),
    memo: at("memo"),
    garbageDays: days("garbage"),
    recyclingDays: days("recycling"),
    foodscrapsDays: days("foodscraps"),
  };
};

/** Trimmed cell text, "" when the row is shorter than the header or the column does not exist. */
const cellAt = (cells: readonly string[], index: number): string => (index < 0 ? "" : (cells[index] ?? "").trim());

/** Scratch flags for dayMask — safe to share: filled and consumed synchronously. */
const dayFlags: boolean[] = new Array<boolean>(DAY_SUFFIXES.length).fill(false);

const dayMask = (cells: readonly string[], columns: readonly number[]): number => {
  for (let day = 0; day < DAY_SUFFIXES.length; day++) {
    dayFlags[day] = cellAt(cells, columns[day]).toUpperCase() === "Y";
  }
  return weekdayMaskFromFlags(dayFlags);
};

/** One data row -> one stop, or null when the row is unusable or repeats an earlier (lineid, rank). */
const buildRecord = (
  cells: readonly string[],
  columns: NtpcColumns,
  seen: Set<string>,
): GarbageRouteStopRecord | null => {
  const lineId = textOrNull(cellAt(cells, columns.lineId));
  const district = textOrNull(cellAt(cells, columns.district));
  const stopName = collapseLineBreaks(cellAt(cells, columns.stopName));
  if (!lineId || !district || stopName === "") return null;

  const rankText = cellAt(cells, columns.rank);
  if (!/^\d+$/.test(rankText)) return null;
  const stopRank = Number(rankText);

  const coordinates = parseCoordinates(cellAt(cells, columns.lat), cellAt(cells, columns.lng));
  if (!coordinates) return null;

  const key = `${lineId}|${stopRank}`;
  if (seen.has(key)) return null;
  seen.add(key);

  return {
    city: "new_taipei",
    lineId,
    stopRank,
    lineName: textOrNull(cellAt(cells, columns.lineName)) ?? lineId,
    tripLabel: null,
    team: null,
    district,
    village: textOrNull(cellAt(cells, columns.village)),
    stopName,
    lat: coordinates.lat,
    lng: coordinates.lng,
    arriveTime: normalizeClock(cellAt(cells, columns.time)),
    departTime: null,
    garbageDays: dayMask(cells, columns.garbageDays),
    recyclingDays: dayMask(cells, columns.recyclingDays),
    foodscrapsDays: dayMask(cells, columns.foodscrapsDays),
    memo: textOrNull(collapseLineBreaks(cellAt(cells, columns.memo))),
  };
};

/**
 * Validates the header (throws if the text is clearly not this CSV) and returns the row
 * stream plus the resolved columns, or null when there is no header at all (empty text).
 */
const openCsv = (csvText: string): { rows: Generator<string[], void, undefined>; columns: NtpcColumns } | null => {
  assertHeaderColumns(csvText, REQUIRED_COLUMNS, SOURCE_LABEL);
  const rows = iterateCsvRows(csvText);
  const header = rows.next();
  if (header.done) return null;
  return { rows, columns: resolveColumns(header.value) };
};

/** Parses the 125664 CSV text into stop rows. Throws if the text is clearly not this CSV; skips unusable rows. */
export function parseNtpcRoutes(csvText: string): GarbageRouteStopRecord[] {
  const opened = openCsv(csvText);
  if (!opened) return [];

  const seen = new Set<string>();
  const records: GarbageRouteStopRecord[] = [];
  for (const cells of opened.rows) {
    const record = buildRecord(cells, opened.columns, seen);
    if (record) records.push(record);
  }
  return records;
}

export interface ParseNtpcYieldingOptions {
  /** Rows between hand-backs to the event loop. Defaults to PARSE_YIELD_EVERY_ROWS. */
  yieldEveryRows?: number;
  /** What to await at each hand-back. Defaults to yieldToEventLoop; tests inject a counter. */
  yieldFn?: () => Promise<void>;
}

/**
 * Same result as parseNtpcRoutes, but gives the event loop back every few hundred rows so
 * a slow host never sits in one multi-hundred-millisecond synchronous stretch.
 */
export async function parseNtpcRoutesYielding(
  csvText: string,
  options: ParseNtpcYieldingOptions = {},
): Promise<GarbageRouteStopRecord[]> {
  const yieldEveryRows = Math.max(1, options.yieldEveryRows ?? PARSE_YIELD_EVERY_ROWS);
  const yieldFn = options.yieldFn ?? yieldToEventLoop;

  const opened = openCsv(csvText);
  if (!opened) return [];

  const seen = new Set<string>();
  const records: GarbageRouteStopRecord[] = [];
  let rowsSinceYield = 0;
  for (const cells of opened.rows) {
    const record = buildRecord(cells, opened.columns, seen);
    if (record) records.push(record);
    if (++rowsSinceYield >= yieldEveryRows) {
      rowsSinceYield = 0;
      await yieldFn();
    }
  }
  return records;
}

export async function fetchNtpcRoutes(hooks: GarbageRouteFetchHooks = {}): Promise<GarbageRouteStopRecord[]> {
  // Shared httpClient, never the global fetch() — undici's WASM parser OOMs on this host.
  const { status, text } = await httpGetText(SOURCE_URL, { timeoutMs: 90_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`新北市垃圾車路線 (125664) request failed: HTTP ${status}`);
  }
  hooks.onStage?.("after_fetch", { chars: text.length });
  // `text` is not referenced after the parse returns, so the raw CSV is collectable before
  // the caller starts upserting; only the (much smaller) records stay alive.
  const records = await parseNtpcRoutesYielding(text);
  hooks.onStage?.("after_parse", { rows: records.length });
  return records;
}
