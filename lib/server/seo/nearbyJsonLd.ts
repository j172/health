import { NEARBY_DEFAULT_TYPES } from "@/lib/server/nearby/registry";
import type { Locale } from "@/lib/i18n/dictionary";
import { getLocalizedNearbyLabel } from "@/lib/i18n/nearbyLabelContent";
import { buildLocalizedPath, isTranslatedToolSlug } from "@/lib/i18n/translatedPages";
import type { NearbyListEntry } from "./structuredData";

/**
 * The two default "/nearby" types that are not `facilitySearchConfigs` entries
 * (kind "er" / "shelter" in the registry, so they carry no `toolSlug`) still
 * have a tool page behind them — link those so every ListItem is a real page.
 */
const NON_FACILITY_TOOL_SLUG: Record<string, string> = {
  er: "er-status",
  shelter: "disaster-map",
};

/**
 * ItemList entries for "/nearby"'s 8 default facility types, built from the
 * same NearbyTypeDef registry the page itself renders from (so the structured
 * data cannot drift from the visible list). Names follow the page locale;
 * zh entries also carry the one-line data-source description, which the
 * registry only has in Chinese, so localized entries omit it rather than put
 * Chinese text into an English/Japanese/Korean page's structured data.
 */
export const buildNearbyJsonLdEntries = (baseUrl: string, locale: Locale = "zh-TW"): NearbyListEntry[] =>
  NEARBY_DEFAULT_TYPES.map((def) => {
    const toolSlug = def.toolSlug ?? NON_FACILITY_TOOL_SLUG[def.key];
    const path = toolSlug
      ? isTranslatedToolSlug(toolSlug)
        ? buildLocalizedPath(`/tools/${toolSlug}`, locale)
        : `/tools/${toolSlug}`
      : undefined;

    if (locale === "zh-TW") {
      return { name: def.label, ...(path ? { url: `${baseUrl}${path}` } : {}), description: def.description };
    }
    return {
      name: getLocalizedNearbyLabel(def.key, locale, def.label),
      ...(path ? { url: `${baseUrl}${path}` } : {}),
    };
  });
