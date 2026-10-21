/**
 * First-character stroke counts (Traditional Chinese) for every category
 * label and tool title/navLabel first character used by the Nav and
 * Footer components' sort order (see `compareByStrokeOrder` below).
 *
 * GENERATED — do not hand-edit. Regenerate with:
 *   node scripts/generate-stroke-table.mjs
 * Source of truth: the `cnchar` + `cnchar-trad` npm packages (devDependencies
 * only — see that script for why this is a committed static table rather
 * than a runtime dependency).
 */
export const STROKE_COUNTS: Record<string, number> = {
  "中": 4,
  "交": 6,
  "今": 4,
  "信": 9,
  "健": 10,
  "兒": 8,
  "全": 6,
  "出": 5,
  "助": 7,
  "卡": 5,
  "即": 7,
  "去": 5,
  "合": 6,
  "器": 16,
  "在": 6,
  "垃": 8,
  "壓": 17,
  "婦": 11,
  "孕": 5,
  "室": 9,
  "家": 10,
  "就": 12,
  "庇": 7,
  "心": 4,
  "急": 9,
  "懷": 19,
  "成": 6,
  "戒": 7,
  "戶": 4,
  "托": 6,
  "敬": 12,
  "文": 4,
  "早": 6,
  "書": 10,
  "有": 6,
  "本": 5,
  "母": 5,
  "每": 7,
  "無": 12,
  "特": 10,
  "環": 17,
  "產": 11,
  "目": 5,
  "睡": 13,
  "碳": 14,
  "社": 7,
  "空": 8,
  "緊": 14,
  "罕": 7,
  "育": 8,
  "腰": 13,
  "藥": 18,
  "血": 6,
  "身": 7,
  "農": 13,
  "遠": 13,
  "避": 16,
  "醫": 18,
  "長": 8,
  "防": 6,
  "颱": 14,
  "食": 9,
  "飲": 12,
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
  // Explicit locale, never `undefined`: the default locale differs between the
  // Node server and the visitor's browser, and a label whose first character is
  // missing from STROKE_COUNTS lands here — so the SSR'd nav order and the
  // client's would disagree and React would throw hydration error #418.
  return a.localeCompare(b, "zh-Hant", { numeric: true });
}
