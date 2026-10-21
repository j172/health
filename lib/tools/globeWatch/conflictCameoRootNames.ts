import type { Locale } from "@/lib/i18n/dictionary";

/**
 * Issue #774 (parent #773) — locale-aware name + marker color for the
 * "武裝衝突" (conflicts) item's two CAMEO root codes, mirrored (deliberately
 * duplicated, not imported) from lib/server/gdelt/cameoConflictCodes.ts's
 * `CameoConflictRootCode`, following the exact same precedent
 * lib/tools/globeWatch/disasterTypeNames.ts and
 * lib/tools/globeWatch/typhoonsTransform.ts's own `GDACS_ALERT_COLORS`
 * already set: everything under lib/tools/globeWatch/ is a zero-server-
 * dependency pure module (no DB, no DOM, no MapLibre — see
 * disastersTransform.ts's own doc comment) so it can be imported directly
 * into a "use client" component; importing the lib/server/* module instead
 * would pull a server-only boundary into the client bundle for no reason,
 * since this file only needs the two literal code strings, not the fetch
 * pipeline that filters by them.
 *
 * Color convention: this item has no three-tier Green/Orange/Red alert scale
 * of its own (every row that reaches this table has already passed the
 * CAMEO 19/20 filter, so there is no "safe" tier to show) — it instead reuses
 * GDACS's own Orange/Red severity colors (see
 * lib/tools/globeWatch/disasterAlertLevelNames.ts's GDACS_ALERT_LEVEL_NAMES)
 * so root 20 (the more severe "mass violence" category) reads as visually
 * more alarming than root 19 ("fight"), consistent with how every other
 * Global Watch item already encodes severity by color (AC/spec: "視覺上沿用
 * 既有的 severity 配色慣例").
 */
export type ConflictCameoRootCode = "19" | "20";

export const CONFLICT_CAMEO_ROOT_CODES: readonly ConflictCameoRootCode[] = ["19", "20"];

interface ConflictRootNameEntry {
  zh: string;
  en: string;
  ja: string;
  ko: string;
  /** Same hex values as GDACS_ALERT_LEVEL_NAMES.Orange/.Red — see this
   * module's own doc comment for why they're duplicated here rather than
   * imported. */
  color: string;
}

export const CONFLICT_ROOT_NAMES: Record<ConflictCameoRootCode, ConflictRootNameEntry> = {
  "19": { zh: "武裝衝突（交戰）", en: "Armed conflict (fighting)", ja: "武力衝突（交戦）", ko: "무력 충돌(교전)", color: "#f97316" },
  "20": { zh: "非常規大規模暴力", en: "Mass violence (unconventional)", ja: "非正規の大規模暴力", ko: "비정규 대규모 폭력", color: "#dc2626" },
};

/** Neutral fallback marker/legend color for a root code this table
 * shouldn't ever contain (defensive — the ingestion pipeline already
 * filters to 19/20 only; see lib/server/gdelt/sources/gdelt.ts). */
export const UNKNOWN_CONFLICT_ROOT_COLOR = "#94a3b8";

export function isConflictCameoRootCode(value: string | null | undefined): value is ConflictCameoRootCode {
  return value === "19" || value === "20";
}

/** The color a marker/legend swatch should use for `rootCode`, never a
 * guessed color for an unrecognized value. */
export function resolveConflictRootColor(rootCode: string): string {
  return isConflictCameoRootCode(rootCode) ? CONFLICT_ROOT_NAMES[rootCode].color : UNKNOWN_CONFLICT_ROOT_COLOR;
}

/** Resolves `rootCode`'s localized name for `locale`. Falls back to the raw
 * code verbatim (never a guessed translation) when it isn't "19"/"20". */
export function resolveConflictRootName(rootCode: string, locale: Locale): string {
  if (!isConflictCameoRootCode(rootCode)) return rootCode;
  const entry = CONFLICT_ROOT_NAMES[rootCode];
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
