/**
 * Helpers shared by the per-city live-truck adapters (issue #679).
 */

const TAIPEI_UTC_OFFSET_HOURS = 8;

/**
 * Reads a wall-clock time as published by Taiwanese city open-data feeds
 * ("2026/10/15 22:48:51", "2026-10-15 22:48:51" or "2026-10-15T22:48:51",
 * seconds optional) as Asia/Taipei time and returns the UTC instant as an ISO
 * string. Taiwan has no daylight saving, so a fixed +08:00 is exact. Returns
 * null for anything that is not a real calendar date and clock time (month 13,
 * February 30th, hour 24) so a garbage cell drops one row instead of drawing a
 * truck at a nonsense time.
 */
export function parseTaipeiLocalTime(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    match[6] === undefined ? 0 : Number(match[6]),
  ];
  if (hour > 23 || minute > 59 || second > 59) return null;

  const utc = new Date(Date.UTC(year, month - 1, day, hour - TAIPEI_UTC_OFFSET_HOURS, minute, second));
  // Round-trip through the calendar: Date.UTC silently rolls 2026/02/30 over to March 2nd.
  const local = new Date(utc.getTime() + TAIPEI_UTC_OFFSET_HOURS * 3_600_000);
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) return null;
  return utc.toISOString();
}

export interface LatLngBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function isInBounds(lat: number, lng: number, bounds: LatLngBounds): boolean {
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}
