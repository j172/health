import type { Locale } from "@/lib/i18n/dictionary";

/**
 * Issue #594 (parent #583) — GDACS's own three-tier alert color, mirrored
 * from lib/server/gdacs/types.ts's `GdacsAlertLevel` (kept as a local
 * string-literal union rather than importing that type, so this stays a
 * zero-dependency pure module like the rest of lib/tools/globeWatch/*).
 */
export type GdacsAlertLevelName = "Green" | "Orange" | "Red";

interface AlertLevelNameEntry {
  zh: string;
  en: string;
  ja: string;
  ko: string;
  /** AC: "依 GDACS 紅/橙/綠警戒等級上色" — this hex value is the single source
   * of truth both the globe marker layer and the legend read from, so they
   * can never disagree about what color means which level (same convention
   * as earthquakeGlobeFeatures.ts's EARTHQUAKE_GLOBE_LEGEND). */
  color: string;
}

export const GDACS_ALERT_LEVELS: readonly GdacsAlertLevelName[] = ["Green", "Orange", "Red"];

/** Most-severe-first ordering, used to sort list rows and to pick a
 * country's/group's worst alert level when several apply. */
export const GDACS_ALERT_LEVEL_ORDER: Record<GdacsAlertLevelName, number> = {
  Red: 3,
  Orange: 2,
  Green: 1,
};

export const GDACS_ALERT_LEVEL_NAMES: Record<GdacsAlertLevelName, AlertLevelNameEntry> = {
  Green: { zh: "綠色警戒", en: "Green alert", ja: "緑色警戒", ko: "녹색 경보", color: "#16a34a" },
  Orange: { zh: "橙色警戒", en: "Orange alert", ja: "オレンジ警戒", ko: "주황색 경보", color: "#f97316" },
  Red: { zh: "紅色警戒", en: "Red alert", ja: "赤色警戒", ko: "적색 경보", color: "#dc2626" },
};

/** Neutral fallback marker/legend color for an alert level GDACS didn't send
 * as one of Green/Orange/Red (defensive — GDACS's own parser already
 * defaults an unrecognized value to "Green" before it ever reaches here; see
 * lib/server/gdacs/sources/gdacs.ts). */
export const UNKNOWN_ALERT_LEVEL_COLOR = "#94a3b8";

export function isGdacsAlertLevelName(value: string | null | undefined): value is GdacsAlertLevelName {
  return value === "Green" || value === "Orange" || value === "Red";
}

/** The color a marker/legend swatch should use for `level` — never a guessed
 * color for an unrecognized level, just the neutral fallback above. */
export function resolveAlertLevelColor(level: string): string {
  return isGdacsAlertLevelName(level) ? GDACS_ALERT_LEVEL_NAMES[level].color : UNKNOWN_ALERT_LEVEL_COLOR;
}

/**
 * Resolves `level`'s localized alert-level name for `locale`. Falls back to
 * the raw GDACS value verbatim (never a guessed translation) when `level`
 * isn't one of Green/Orange/Red (AC: 查不到時顯示原文).
 */
export function resolveAlertLevelName(level: string, locale: Locale): string {
  if (!isGdacsAlertLevelName(level)) return level;
  const entry = GDACS_ALERT_LEVEL_NAMES[level];
  switch (locale) {
    case "en":
      return entry.en;
    case "ja":
      return entry.ja;
    case "ko":
      return entry.ko;
    default:
      return entry.zh;
  }
}
