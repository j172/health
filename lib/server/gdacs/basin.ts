/**
 * Derives a tropical cyclone's ocean basin from its centroid lat/lng.
 *
 * GDACS's event-list and event-detail APIs do not include a basin field for
 * TC events anywhere (confirmed by grepping a live payload captured
 * 2026-10-14 for "basin" — zero matches), even though the spec (#583/#592)
 * requires storing one. This is a simplified box classifier, not the
 * official WMO/RSMC basin boundaries (those follow coastlines and treaty
 * lines, not straight lng cuts) — good enough to label "which ocean", not
 * precise enough for anything that needs the exact responsible-agency
 * boundary. Revisit if a later ticket needs finer accuracy.
 */
export type GdacsBasin = "WP" | "EP" | "NA" | "NI" | "SI" | "AU" | "SP" | "SA";

export const deriveTcBasin = (lat: number, lng: number): GdacsBasin | null => {
  // Normalize to (-180, 180] so callers can pass either convention.
  const normalizedLng = (((lng + 180) % 360) + 360) % 360 - 180;

  // EP/NA (north) and SP/SA (south) are split at the Central/South American
  // isthmus, not a round number — real boundaries hug the coastline
  // (roughly -77 to -83 depending on latitude). -75 is a deliberately simple
  // stand-in good enough to tell "Pacific side" from "Atlantic side" of the
  // Americas; it is not the real RSMC boundary.
  const AMERICAS_LNG = -75;

  if (lat >= 0) {
    // Northern hemisphere.
    if (normalizedLng >= 100 && normalizedLng <= 180) return "WP"; // Western Pacific (incl. Taiwan)
    if (normalizedLng >= -180 && normalizedLng < AMERICAS_LNG) return "EP"; // Eastern Pacific
    if (normalizedLng >= AMERICAS_LNG && normalizedLng < 0) return "NA"; // North Atlantic
    if (normalizedLng >= 30 && normalizedLng < 100) return "NI"; // North Indian Ocean
    return null; // 0–30°E: no basin (Mediterranean/North Africa — TCs don't form here)
  }

  // Southern hemisphere.
  if (normalizedLng >= 20 && normalizedLng < 90) return "SI"; // South-West Indian Ocean
  if (normalizedLng >= 90 && normalizedLng < 160) return "AU"; // Australian region
  if (normalizedLng >= 160 || normalizedLng < AMERICAS_LNG) return "SP"; // South Pacific (crosses the dateline)
  if (normalizedLng >= AMERICAS_LNG && normalizedLng < 20) return "SA"; // South Atlantic (rare)
  return null;
};
