/**
 * Small helpers shared by the two garbage-route CSV parsers (issue #674).
 */

/** Taiwan incl. Penghu, Kinmen, Matsu — wide on purpose; this only rejects 0,0 / swapped / garbage values. */
const LAT_RANGE = { min: 21.5, max: 26.5 };
const LNG_RANGE = { min: 118.0, max: 123.0 };

/**
 * Parses a lat/lng pair from CSV cells. Returns null when either side is
 * missing, non-numeric, or outside Taiwan's bounding box — such a stop is
 * skipped rather than stored at a bogus place on the map.
 */
export function parseCoordinates(
  latRaw: string | undefined,
  lngRaw: string | undefined,
): { lat: number; lng: number } | null {
  if (!latRaw || !lngRaw) return null;
  // Live Taipei data has a quoted cell like " 25.036617734018307," (stray space and
  // trailing comma) on one 舊莊-2 stop; strip that punctuation instead of losing the stop.
  const clean = (raw: string) => raw.trim().replace(/^[,，;\s]+|[,，;\s]+$/g, "");
  const lat = Number(clean(latRaw));
  const lng = Number(clean(lngRaw));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < LAT_RANGE.min || lat > LAT_RANGE.max) return null;
  if (lng < LNG_RANGE.min || lng > LNG_RANGE.max) return null;
  return { lat, lng };
}

/** Empty / whitespace-only cell -> null, otherwise the trimmed text. */
export function textOrNull(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Collapses line breaks (and the indentation around them) that a quoted CSV cell
 * can carry — New Taipei's file has stop names such as "和平路57號⏎(路牌下收運後
 * 迴轉)" — without inserting a space, since these are Chinese place names.
 */
export function collapseLineBreaks(raw: string | undefined): string {
  return (raw ?? "").replace(/\s*[\r\n]+\s*/g, "").trim();
}

/**
 * Throws unless the CSV's first line carries every expected column name —
 * catches an HTML error/maintenance page or a renamed header, which parseCsv
 * would otherwise turn into "a header and no rows" and a silent empty result.
 * Empty text is left alone (callers treat it as "no rows"; the sync's
 * snapshot guard refuses to prune on an empty fetch).
 */
export function assertHeaderColumns(text: string, required: readonly string[], sourceLabel: string): void {
  if (text.trim() === "") return;
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0];
  const present = new Set(firstLine.split(",").map((column) => column.trim()));
  const missing = required.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new Error(`${sourceLabel}: unexpected CSV header, missing column(s): ${missing.join(", ")}`);
  }
}
