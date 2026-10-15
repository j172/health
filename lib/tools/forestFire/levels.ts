/**
 * 林火風險等級 (forest fire danger level) — shared, dependency-free module used by
 * the parser (server), the overview builder (server) and the page section (client).
 *
 * Source semantics: MOA OpenAPI `ForestFireAlertWCF` documents
 * `warn_level` as 0 安全 / 1 注意 / 2 警告 / 3 危險 / 4 最危險, and
 * `warn_level_chinese` as the same five labels. The fire-use advice text is the
 * 林業及自然保育署「林火風險評估系統」own wording for each grade
 * (https://ffwi.forest.gov.tw/Home_new/doc): note that even the lowest grade
 * says 「小心使用火源」, i.e. 安全 never means "no risk at all".
 */
export type ForestFireLevel = 0 | 1 | 2 | 3 | 4;

export const FOREST_FIRE_LEVEL_VALUES: readonly ForestFireLevel[] = [0, 1, 2, 3, 4];

export interface ForestFireLevelMeta {
  level: ForestFireLevel;
  /** The label MOA publishes in `warn_level_chinese`. */
  name: string;
  /** FFWI's grade wording, e.g. 「安全級」. */
  grade: string;
  /** Official one-line fire-use advice for this grade. */
  advice: string;
}

export const FOREST_FIRE_LEVELS: Record<ForestFireLevel, ForestFireLevelMeta> = {
  0: { level: 0, name: "安全", grade: "安全級", advice: "小心使用火源" },
  1: { level: 1, name: "注意", grade: "注意級", advice: "注意使用火源" },
  2: { level: 2, name: "警告", grade: "警告級", advice: "謹慎使用火源" },
  3: { level: 3, name: "危險", grade: "危險級", advice: "請勿隨意引火" },
  4: { level: 4, name: "最危險", grade: "最危險級", advice: "禁止吸菸引火" },
};

export const isKnownForestFireLevel = (value: unknown): value is ForestFireLevel =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;

const NAME_TO_LEVEL: Record<string, ForestFireLevel> = {
  安全: 0,
  注意: 1,
  警告: 2,
  危險: 3,
  最危險: 4,
};

/** Upstream uses the literal string "NULL" for "no value" in several fields. */
const isBlank = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" || trimmed.toUpperCase() === "NULL";
  }
  return false;
};

const levelFromNumeric = (value: unknown): ForestFireLevel | null => {
  if (typeof value === "number") return isKnownForestFireLevel(value) ? value : null;
  if (typeof value === "string" && /^\s*\d+\s*$/.test(value)) {
    const n = Number(value);
    return isKnownForestFireLevel(n) ? n : null;
  }
  return null;
};

const levelFromName = (value: unknown): ForestFireLevel | null => {
  if (typeof value !== "string") return null;
  return NAME_TO_LEVEL[value.trim()] ?? null;
};

/**
 * Resolves the level from the two redundant upstream fields.
 *
 * Returns `null` — which callers must treat as "unknown, do not display", never
 * as 安全 — when:
 *  - neither field carries a value,
 *  - a field that does carry a value is not one of the five documented values
 *    (e.g. a new level 5, or a typo), or
 *  - the numeric and 中文 fields disagree.
 */
export const resolveForestFireLevel = (
  warnLevel: unknown,
  warnLevelChinese: unknown,
): ForestFireLevel | null => {
  const hasNumeric = !isBlank(warnLevel);
  const hasName = !isBlank(warnLevelChinese);
  if (!hasNumeric && !hasName) return null;

  const fromNumeric = hasNumeric ? levelFromNumeric(warnLevel) : null;
  const fromName = hasName ? levelFromName(warnLevelChinese) : null;

  if (hasNumeric && fromNumeric === null) return null;
  if (hasName && fromName === null) return null;
  if (fromNumeric !== null && fromName !== null && fromNumeric !== fromName) return null;
  return fromNumeric ?? fromName;
};
