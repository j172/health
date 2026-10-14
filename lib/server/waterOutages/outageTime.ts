import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * wra_water_outages.start_time / end_time hold Taipei wall-clock DATETIMEs
 * (see ingestWraWaterOutages.ts), but the pool reads DATETIMEs with
 * `timezone: "Z"`, so a Date coming back from mysql2 carries the wall-clock
 * digits as if they were UTC — 8 hours late. Shift it back to the real
 * instant so clients formatting it in local time show the right hour.
 */
export function taipeiWallClockToUtcIso(value: Date | string | null | undefined): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : new Date(value.getTime() - TAIPEI_OFFSET_MS).toISOString();
  }
  const parsed = parseTaipeiDateToUtc(String(value ?? "").slice(0, 19));
  return parsed ? parsed.toISOString() : String(value ?? "");
}

/** A real UTC instant -> the Taipei wall-clock DATETIME literal stored in wra_water_outages. */
export function utcMsToTaipeiSql(utcMs: number): string {
  return new Date(utcMs + TAIPEI_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
}

/**
 * `status` is derived once at ingestion and never revisited: a case that has
 * since dropped out of WRA's feed keeps whatever status it had on its last
 * sync, so finished outages piled up as "active" (1,643 of 1,692 on
 * 2026-10-14, back to mid-September). Re-derive it from the times instead.
 */
export function deriveOutageStatus(
  startIso: string,
  endIso: string,
  nowMs: number,
): "active" | "scheduled" | "resolved" {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (Number.isFinite(endMs) && nowMs >= endMs) return "resolved";
  if (Number.isFinite(startMs) && nowMs < startMs) return "scheduled";
  return "active";
}
