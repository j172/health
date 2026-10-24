/**
 * First-character stroke counts (Traditional Chinese) for every category
 * label and tool title/navLabel first character used by the Nav and
 * Footer components' sort order (see `compareByStrokeOrder` below).
 *
 * GENERATED — do not hand-edit. Regenerate with:
 *   node scripts/generate-stroke-table.mjs（已移除，見 git 歷史）
 * Source of truth: the `cnchar` + `cnchar-trad` npm packages (devDependencies
 * only — see that script for why this is a committed static table rather
 * than a runtime dependency).
 */
export const STROKE_COUNTS: Record<string, number> = {
  "中": 4,
  "今": 4,
  "公": 4,
  "心": 4,
  "戶": 4,
  "文": 4,
  "卡": 5,
  "去": 5,
  "本": 5,
  "母": 5,
  "目": 5,
  "交": 6,
  "全": 6,
  "合": 6,
  "在": 6,
  "地": 6,
  "成": 6,
  "托": 6,
  "早": 6,
  "有": 6,
  "血": 6,
  "防": 6,
  "助": 7,
  "即": 7,
  "庇": 7,
  "戒": 7,
  "每": 7,
  "社": 7,
  "罕": 7,
  "身": 7,
  "兒": 8,
  "垃": 8,
  "空": 8,
  "育": 8,
  "長": 8,
  "信": 9,
  "室": 9,
  "急": 9,
  "食": 9,
  "健": 10,
  "書": 10,
  "特": 10,
  "國": 11,
  "婦": 11,
  "捷": 11,
  "產": 11,
  "就": 12,
  "敬": 12,
  "無": 12,
  "飲": 12,
  "睡": 13,
  "腰": 13,
  "農": 13,
  "碳": 14,
  "緊": 14,
  "臺": 14,
  "器": 16,
  "避": 16,
  "壓": 17,
  "環": 17,
  "藥": 18,
  "醫": 18,
  "體": 22,
};

const isAsciiLetter = (ch: string): boolean => /[A-Za-z]/.test(ch);

/** Whether a displayed label starts with a Latin letter (BMI, VO2Max, …) —
 * these form one alphabetical block ahead of every Chinese label, per the
 * navbar/footer sort rule (spec: navbar-footer-reclassification-and-merges §0.2). */
export function isEnglishLabel(label: string): boolean {
  return isAsciiLetter(label.trim().charAt(0));
}

function strokeCountOf(label: string): number | undefined {
  const first = label.trim().charAt(0);
  return STROKE_COUNTS[first];
}

/**
 * Shared Nav/Footer ordering rule (spec: navbar-footer-reclassification-and-merges
 * §0.2):
 * - If a specific non-zh locale is provided (e.g. "en", "ja", "ko"), sort by that
 *   locale's native collation rules.
 * - For Chinese / default: Latin-named items first as one alphabetical block, then
 *   Chinese items by first-character stroke count ascending.
 * - Graceful fallback: If a character is not in STROKE_COUNTS (e.g. Japanese Kanji,
 *   Kana, Hangul, or symbols), fall back to standard string collation rather than
 *   throwing, preventing client-side React rendering crashes during language switching.
 */
export function compareByStrokeOrder(a: string, b: string, locale?: string): number {
  if (locale === "en" || locale === "ja" || locale === "ko") {
    return a.localeCompare(b, locale, { numeric: true });
  }
  const aEnglish = isEnglishLabel(a);
  const bEnglish = isEnglishLabel(b);
  if (aEnglish !== bEnglish) return aEnglish ? -1 : 1;
  if (aEnglish && bEnglish) {
    return a.localeCompare(b, "en", { numeric: true });
  }
  const countA = strokeCountOf(a);
  const countB = strokeCountOf(b);
  if (countA !== undefined && countB !== undefined) {
    const strokeDiff = countA - countB;
    if (strokeDiff !== 0) return strokeDiff;
    return a.localeCompare(b, "zh-Hant", { numeric: true });
  }
  if (countA !== undefined) return -1;
  if (countB !== undefined) return 1;
  return a.localeCompare(b, "zh-Hant", { numeric: true });
}
