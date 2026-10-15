import type { Locale } from "@/lib/i18n/dictionary";

/**
 * Issue #587 (parent #583): OpenFreeMap's vector tiles (OpenMapTiles schema)
 * carry one name field per language on every place/label feature —
 * `name:zh-Hant`, `name:en`, `name:ja`, `name:ko`, plus a bare `name` that
 * holds the *local* name (e.g. Tokyo's `name` is Japanese, not whatever
 * locale the site happens to be in). Per #583's Implementation Decisions
 * ("標籤依目前語言選用 name:zh-Hant / name:en / name:ja / name:ko，沒有就退回
 * name"), the globe's basemap labels must follow the page's locale and fall
 * back to that bare `name` field when the localized one is missing — never
 * guess or fabricate a translation.
 *
 * This module is intentionally pure (no MapLibre, no DOM) so the
 * language → field mapping and the fallback rule are unit-testable without a
 * browser; `components/Tools/GlobeWatch/GlobeWatchGlobe.tsx` is the only
 * consumer that actually touches a live MapLibre style.
 */

/** OpenMapTiles name field for each of this site's 4 supported locales. */
export const LOCALE_NAME_FIELD: Record<Locale, string> = {
  "zh-TW": "name:zh-Hant",
  en: "name:en",
  ja: "name:ja",
  ko: "name:ko",
};

/** The OpenMapTiles field that always holds a place's name in its own local language. */
export const DEFAULT_NAME_FIELD = "name";

/**
 * Resolves the label a basemap feature should show for a given locale, given
 * that feature's GeoJSON/vector-tile `properties` bag. Returns `undefined`
 * (never throws) when neither the localized field nor the default field has
 * a usable string — callers should simply not render a label in that case
 * rather than fall back to a guessed or empty string.
 */
export function resolveFeatureLabel(
  properties: Record<string, unknown> | null | undefined,
  locale: Locale,
): string | undefined {
  if (!properties) return undefined;

  const localizedField = LOCALE_NAME_FIELD[locale] ?? DEFAULT_NAME_FIELD;
  const localized = properties[localizedField];
  if (typeof localized === "string" && localized.trim().length > 0) {
    return localized;
  }

  const fallback = properties[DEFAULT_NAME_FIELD];
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback;
  }

  return undefined;
}

/**
 * MapLibre style `text-field` expression that performs the same fallback
 * (`LOCALE_NAME_FIELD[locale]` → `name`) entirely inside the GL style engine,
 * for labels drawn by the basemap's own symbol layers (where we never see
 * each feature's `properties` object in JS — only the style has that). Pure
 * data, so it's testable without a map instance; `GlobeWatchGlobe.tsx`
 * applies it to the style's symbol layers that currently key off `name`.
 */
export function buildLabelFieldExpression(locale: Locale): unknown[] {
  const localizedField = LOCALE_NAME_FIELD[locale] ?? DEFAULT_NAME_FIELD;
  if (localizedField === DEFAULT_NAME_FIELD) {
    return ["get", DEFAULT_NAME_FIELD];
  }
  return ["coalesce", ["get", localizedField], ["get", DEFAULT_NAME_FIELD]];
}
