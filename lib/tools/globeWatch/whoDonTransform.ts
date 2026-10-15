/**
 * Issue #597 (parent #583) — the "項目 → 地球資料" pure-transform module for
 * the 國際疫情 (epidemics) item's WHO Disease Outbreak News (DON) pin
 * overlay. Same contract every other lib/tools/globeWatch/* module follows:
 * no DB, no DOM, no MapLibre import. Input is already-queried
 * `who_outbreak_news` rows (the shape `getRecentWhoOutbreakNews()` returns —
 * see lib/server/who/queries.ts); output is a locale-agnostic,
 * MapLibre-agnostic list of pin features the client joins against
 * EPIDEMIC_COUNTRY_NAMES (country label) at render time.
 *
 * This is deliberately additive to, not a replacement of, #589's own
 * `buildEpidemicsGlobeData` — the country choropleth it builds is untouched
 * by anything in this file.
 */

import { resolveCountryCenter } from "./epidemicsCountryCenters";

export interface WhoDonRow {
  /** WHO's own DonId, e.g. "2026-DON620". */
  articleId: string;
  /** Full original-language (English) DON title, exactly as published. */
  title: string;
  /** ISO 8601 (or MySQL-DATETIME-compatible) publish timestamp string. */
  publishDate: string;
  /** Disease name exactly as it appears in the title's disease segment
   * (original language, English). */
  diseaseRaw: string;
  /** Dictionary-mapped disease name (lib/server/who/diseaseNames.ts), or
   * null when diseaseRaw wasn't in that hand-checked dictionary. */
  diseaseMapped: string | null;
  /** ISO 3166-1 alpha-2 country code resolved at sync time
   * (lib/server/who/countryIso.ts), or null when the title's location
   * segment didn't resolve to exactly one country ("Global",
   * "Multi-country", a WHO region, etc.). */
  countryIso: string | null;
  /** The DON article's public URL. */
  url: string;
}

export interface WhoDonPinFeature {
  /** Same as the source row's articleId — stable pin identity for
   * click-to-select and for React list keys. */
  id: string;
  iso: string;
  lat: number;
  lng: number;
  /** Original-language title (AC: 點擊圖釘顯示標題原文). */
  title: string;
  /** AC: "疾病（查字典，查不到顯示原文）" — diseaseMapped when the dictionary
   * resolved it, otherwise diseaseRaw verbatim. Never a guessed translation. */
  disease: string;
  diseaseRaw: string;
  diseaseMapped: string | null;
  publishDate: string;
  url: string;
}

/**
 * Maps WHO DON rows to country-center-point pin features (AC: 轉換模組能將
 * WHO DON 資料列對應到國家中心點座標). A row is dropped from the pin layer
 * (not plotted with a guessed location) when either:
 *   - it has no resolved countryIso at all (WHO title didn't resolve to a
 *     single country — "Global"/"Multi-country"/regional titles), or
 *   - its countryIso isn't in EPIDEMIC_COUNTRY_CENTERS' closed coordinate
 *     table (shouldn't happen given that table's coverage test, but this
 *     function never assumes it and degrades the same "drop, don't guess"
 *     way either case does).
 * Dropping here never loses the article anywhere else in the product: the
 * carried-over 國際重要疫情快訊 feed and any future WHO DON list view both
 * read `who_outbreak_news` directly, not through this function.
 */
export function buildWhoDonPinFeatures(rows: WhoDonRow[]): WhoDonPinFeature[] {
  const pins: WhoDonPinFeature[] = [];
  for (const row of rows) {
    const iso = (row.countryIso ?? "").trim().toUpperCase();
    if (!iso) continue;
    const center = resolveCountryCenter(iso);
    if (!center) continue;
    pins.push({
      id: row.articleId,
      iso,
      lat: center.lat,
      lng: center.lng,
      title: row.title,
      disease: row.diseaseMapped ?? row.diseaseRaw,
      diseaseRaw: row.diseaseRaw,
      diseaseMapped: row.diseaseMapped,
      publishDate: row.publishDate,
      url: row.url,
    });
  }
  return pins;
}

/** Convenience lookup used by the pin-detail panel — `null` when `id` is
 * null/not found (not an error; nothing may be selected yet). */
export function findWhoDonPin(pins: WhoDonPinFeature[], id: string | null | undefined): WhoDonPinFeature | null {
  if (!id) return null;
  return pins.find((p) => p.id === id) ?? null;
}

/**
 * AC: "關閉切換後圖釘從地球上消失，國家上色不受影響" — the WHO-pin toggle's
 * entire show/hide behavior is this one pure function: visible returns
 * `pins` unchanged, hidden returns an empty array. The caller feeds the
 * result straight into the globe's WHO-pin GeoJSON source; the country
 * choropleth source/layer is a completely separate MapLibre source this
 * function never touches or knows about.
 */
export function filterVisibleWhoDonPins(pins: WhoDonPinFeature[], visible: boolean): WhoDonPinFeature[] {
  return visible ? pins : [];
}
