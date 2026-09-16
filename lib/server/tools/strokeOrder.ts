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
  "信": 9,
  "健": 10,
  "兒": 8,
  "全": 6,
  "公": 4,
  "卡": 5,
  "即": 7,
  "去": 5,
  "台": 5,
  "急": 9,
  "國": 11,
  "地": 6,
  "壓": 17,
  "婦": 11,
  "客": 9,
  "室": 9,
  "居": 8,
  "捷": 11,
  "文": 4,
  "書": 10,
  "本": 5,
  "每": 7,
  "無": 12,
  "環": 17,
  "目": 5,
  "登": 12,
  "睡": 13,
  "碳": 14,
  "空": 8,
  "老": 6,
  "腰": 13,
  "藥": 18,
  "血": 6,
  "身": 7,
  "農": 13,
  "避": 16,
  "醫": 18,
  "長": 8,
  "防": 6,
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

function strokeCountOf(label: string): number {
  const first = label.trim().charAt(0);
  const count = STROKE_COUNTS[first];
  if (count === undefined) {
    throw new Error(
      `No stroke count for "${first}" (from label "${label}") — add it to STROKE_COUNTS ` +
        `by running \`node scripts/generate-stroke-table.mjs\` again.`,
    );
  }
  return count;
}

/**
 * Shared Nav/Footer ordering rule (spec: navbar-footer-reclassification-and-merges
 * §0.2): Latin-named items first as one alphabetical block, then Chinese items by
 * first-character stroke count ascending. Applied identically to category ordering
 * and to the tool ordering within each category — both call this one comparator.
 */
export function compareByStrokeOrder(a: string, b: string): number {
  const aEnglish = isEnglishLabel(a);
  const bEnglish = isEnglishLabel(b);
  if (aEnglish !== bEnglish) return aEnglish ? -1 : 1;
  if (aEnglish && bEnglish) {
    return a.localeCompare(b, "en", { numeric: true });
  }
  const strokeDiff = strokeCountOf(a) - strokeCountOf(b);
  if (strokeDiff !== 0) return strokeDiff;
  return a.localeCompare(b, "zh-Hant", { numeric: true });
}
