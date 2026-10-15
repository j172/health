import type { Locale } from "@/lib/i18n/dictionary";

/**
 * Issue #588 (parent #583): the registry behind global-watch's "單選分頁"
 * item switcher. #587 shipped the globe shell before any item existed, so
 * no tab UI existed yet — this is the first, minimal one. Deliberately just
 * a flat array of `{ key, path, emoji, labelDefault, label }` (no icon
 * components, no per-item layer config, no routing logic) so it hosts each
 * item today without presuming the shape a later item (颱風 etc.) will
 * need — a later ticket can freely grow this array and the tab bar that
 * reads it without this file needing a redesign.
 *
 * Issue #589 (parent #583) added the `label` field: #588 shipped only
 * `labelDefault` (a single zh string rendered unconditionally, even on the
 * `/en/`/`/ja/`/`/ko/` pages) when there was only one item to translate.
 * With a second item (國際疫情) landing in the same tab bar, that gap
 * becomes visible — `label` is now the per-locale lookup `GlobeWatchItemTabs`
 * actually renders from, keyed by this site's 4 supported locales (see
 * `lib/i18n/dictionary.ts`'s `Locale`). `labelDefault` is kept as the
 * zh-TW value / a defensive fallback, not removed, so nothing that still
 * reads it directly breaks.
 *
 * Short tab labels, not full page titles: the English/Japanese/Korean
 * values below aren't invented from scratch — they're the same core
 * vocabulary this repo's own `locales/{en,ja,ko}.json` already use for
 * these two tools' full titles (`catalog.earthquakes` /
 * `catalog["travel-epidemic-alerts"]`), just shortened to tab length the
 * same way the zh `labelDefault` values themselves are already short
 * ("地震", not the catalog's full "臺灣與全球顯著地震查詢"): en "Earthquakes" /
 * ja "地震" / ko "지진" all appear verbatim inside `catalog.earthquakes`'s
 * existing translated string, and en "Epidemics" / ja "国際感染症" /
 * ko "국제 감염병" share the same "epidemic/感染症/감염병" vocabulary
 * `catalog["travel-epidemic-alerts"]` already uses.
 *
 * Issue #598 (parent #583, phase 4) added the "air-quality" (全球空品) item.
 * Its en/ja/ko tab labels borrow the same "air quality" vocabulary
 * `catalog.aqi`'s existing translated string already uses ("Air Quality
 * (AQI)" / "空気質指数" / "공기질 지수(AQI)" in locales/{en,ja,ko}.json),
 * shortened to tab length the same way as the other two items above.
 */
export interface GlobeWatchItemDef {
  key: string;
  /** Canonical (zh, unprefixed) path — the locale-prefixed href is built by
   * the consumer via lib/i18n/translatedPages.ts's buildLocalizedPath. */
  path: string;
  emoji: string;
  /** zh-TW value, kept for back-compat with any consumer that hasn't been
   * updated to read the locale-aware `label` map below. */
  labelDefault: string;
  /** Per-locale tab label — see this module's doc comment for why this
   * exists and where each translation came from. */
  label: Record<Locale, string>;
}

export const GLOBE_WATCH_ITEMS: GlobeWatchItemDef[] = [
  {
    key: "earthquakes",
    path: "/tools/global-watch/earthquakes",
    emoji: "🌍",
    labelDefault: "地震",
    label: { "zh-TW": "地震", en: "Earthquakes", ja: "地震", ko: "지진" },
  },
  {
    key: "epidemics",
    path: "/tools/global-watch/epidemics",
    emoji: "🦠",
    labelDefault: "國際疫情",
    label: { "zh-TW": "國際疫情", en: "Epidemics", ja: "国際感染症", ko: "국제 감염병" },
  },
  // Issue #594 (parent #583): the "全球災害" (disasters) item — GDACS's
  // flood/volcano/drought/wildfire events (EQ/TC are separate items, see
  // lib/tools/globeWatch/disastersTransform.ts's doc comment). Labels follow
  // the same "shortened existing vocabulary, not invented from scratch"
  // convention as the two entries above — en "Disasters" / ja "災害" /
  // ko "재해" are plain, widely-used translations of 災害, consistent with
  // this repo's own disaster-map tool naming.
  {
    key: "disasters",
    path: "/tools/global-watch/disasters",
    emoji: "⚠️",
    labelDefault: "全球災害",
    label: { "zh-TW": "全球災害", en: "Disasters", ja: "災害", ko: "재해" },
  },
  {
    key: "air-quality",
    path: "/tools/global-watch/air-quality",
    emoji: "🌫️",
    labelDefault: "全球空品",
    label: { "zh-TW": "全球空品", en: "Air Quality", ja: "空気質", ko: "공기질" },
  },
];
