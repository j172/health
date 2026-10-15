import type { Locale } from "@/lib/i18n/dictionary";

/**
 * Issue #594 (parent #583) — the "全球災害" (disasters) item only ever shows
 * GDACS's FL (flood) / VO (volcano) / DR (drought) / WF (wildfire) event
 * types; EQ and TC are excluded here on purpose (they're separate
 * global-watch items — see lib/tools/globeWatch/disastersTransform.ts).
 */
export type GdacsDisasterType = "FL" | "VO" | "DR" | "WF";

export const GDACS_DISASTER_TYPES: readonly GdacsDisasterType[] = ["FL", "VO", "DR", "WF"];

interface DisasterTypeNameEntry {
  zh: string;
  en: string;
  ja: string;
  ko: string;
  /** Checkbox/legend/marker emoji — not locale-dependent. */
  emoji: string;
}

/**
 * GDACS event-type code → localized disaster-type name, for the checkbox
 * filter, list rows, and marker popups. A closed, hand-written 4-entry table
 * (not machine-translated) — `resolveDisasterTypeName` below falls back to
 * the raw GDACS code verbatim for anything not listed here (AC: 查不到時顯示
 * 原文), which in practice only matters for test coverage of the fallback
 * path itself, since GDACS's `eventtype` enum is closed and this item never
 * passes anything but FL/VO/DR/WF into it.
 */
export const DISASTER_TYPE_NAMES: Record<GdacsDisasterType, DisasterTypeNameEntry> = {
  FL: { zh: "洪水", en: "Flood", ja: "洪水", ko: "홍수", emoji: "🌊" },
  VO: { zh: "火山", en: "Volcano", ja: "火山", ko: "화산", emoji: "🌋" },
  DR: { zh: "乾旱", en: "Drought", ja: "干ばつ", ko: "가뭄", emoji: "🏜️" },
  WF: { zh: "野火", en: "Wildfire", ja: "森林火災", ko: "산불", emoji: "🔥" },
};

export function isGdacsDisasterType(value: string | null | undefined): value is GdacsDisasterType {
  return !!value && (GDACS_DISASTER_TYPES as readonly string[]).includes(value);
}

/**
 * Resolves `type`'s localized disaster-type name for `locale`. Falls back to
 * the raw GDACS code verbatim (never a guessed translation) when `type`
 * isn't one of FL/VO/DR/WF.
 */
export function resolveDisasterTypeName(type: string, locale: Locale): string {
  if (!isGdacsDisasterType(type)) return type;
  const entry = DISASTER_TYPE_NAMES[type];
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
