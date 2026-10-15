/**
 * Issue #589 (parent #583) — static constants for the 國際疫情 (epidemics)
 * item's country-boundary layer. This module itself is pure data (no fetch,
 * no MapLibre) so it stays independently importable/testable; the actual
 * `fetch()` of the GeoJSON file happens only inside
 * `GlobeWatchEpidemicsGlobe.tsx`, which is itself reached only through a
 * `next/dynamic(..., { ssr: false })` import — so this boundary file is
 * never requested unless a visitor actually opens the epidemics item with
 * WebGL available (AC: "國界檔只在這個項目載入，不影響其他項目的 bundle 大小").
 *
 * See `public/data/globe-watch/ATTRIBUTION.md` for the file's Natural Earth
 * provenance/license and why it counts as the "Taiwan point-of-view"
 * (TWN as its own feature, independent of CHN) version the spec calls for.
 */

import type { EpidemicCountryGroup, EpidemicLegendEntry } from "./epidemicsTransform";

export const EPIDEMIC_BOUNDARIES_URL = "/data/globe-watch/ne-110m-admin0-countries-twn-pov.geojson";

/** The GeoJSON feature property the country-fill layer joins the
 * choropleth data against — ISO 3166-1 alpha-2, Taiwan-friendly variant
 * (Taiwan reads "TW", not the ISO_A2 column's ambiguous "CN-TW"). */
export const EPIDEMIC_BOUNDARY_ISO_PROPERTY = "ISO_A2_EH";

/** Fill color for a country with no current travel alert — a neutral,
 * low-contrast baseline so colored (alerted) countries stand out. */
export const EPIDEMIC_NEUTRAL_FILL_COLOR = "#cbd5e1"; // slate-300

export const EPIDEMIC_BORDER_LINE_COLOR = "#64748b"; // slate-500ish, dark-mode-safe

/**
 * Builds the MapLibre `fill-color` expression for the country choropleth
 * layer: a `match` over the boundary file's `ISO_A2_EH` property, mapping
 * each alerted country to its highest-level color (AC: 依最高等級上色) and
 * everything else to the neutral baseline. Pure (no MapLibre import — just
 * builds a plain array MapLibre's style spec happens to accept), so it's
 * independently testable; `GlobeWatchEpidemicsGlobe.tsx` passes the result
 * straight to `map.setPaintProperty(layerId, "fill-color", ...)`.
 *
 * Returns a plain hex string (not a `match` expression) when there are no
 * alerted countries at all — a `match` expression needs at least one
 * label/output pair before its fallback, which an empty list can't provide.
 */
export function buildCountryFillColorExpression(
  countries: EpidemicCountryGroup[],
  legend: EpidemicLegendEntry[],
  isoProperty: string = EPIDEMIC_BOUNDARY_ISO_PROPERTY,
): unknown[] | string {
  if (countries.length === 0) return EPIDEMIC_NEUTRAL_FILL_COLOR;

  const colorByLevel = new Map(legend.map((entry) => [entry.levelCode, entry.color]));
  const expression: unknown[] = ["match", ["get", isoProperty]];
  for (const country of countries) {
    const color = colorByLevel.get(country.levelCode) ?? EPIDEMIC_NEUTRAL_FILL_COLOR;
    expression.push(country.iso, color);
  }
  expression.push(EPIDEMIC_NEUTRAL_FILL_COLOR);
  return expression;
}
