/**
 * Explicit Cache-Control for public /api/* success responses.
 *
 * A /api/* response with no Cache-Control of its own is given an upstream
 * default of `max-age=1800` (observed live 2026-10-15; not set by this app,
 * next.config.js, middleware.ts or the PHP proxy), so freshly synced data can
 * read stale for 30 minutes. Routes that declare their own header are always
 * honored exactly, so every public route picks one of these presets.
 *
 * Apply to 2xx responses only; leave error responses (4xx/5xx) alone.
 * Returns a fresh ResponseInit per call so callers can pass it straight to
 * `NextResponse.json(data, cacheInit("live"))`.
 */
const PRESETS = {
  /** Never cached: user-specific (coordinates, meal contents), free-text search, writes. */
  none: "no-store",
  /** Fast-moving live readings/availability (minutes). */
  fast: "public, s-maxage=30, stale-while-revalidate=60",
  /** Live readings and alerts synced every 15-60 minutes. */
  live: "public, s-maxage=60, stale-while-revalidate=300",
  /** Hourly-or-slower data. */
  medium: "public, s-maxage=300, stale-while-revalidate=600",
  /** Static reference data that only changes on deploy or a rare sync. */
  reference: "public, s-maxage=600, stale-while-revalidate=1800",
} as const;

export type CachePreset = keyof typeof PRESETS;

export function cacheInit(preset: CachePreset): { headers: { "Cache-Control": string } } {
  return { headers: { "Cache-Control": PRESETS[preset] } };
}
