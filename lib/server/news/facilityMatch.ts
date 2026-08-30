// Tier-1 hospital matching: the alias table and the row-ranking rule.
//
// Split out of geoExtractor.ts (issue #84) for two reasons. It has no imports,
// so `npm test` and scripts/verify-hospital-search-names.mjs can load it
// without dragging in "server-only", mysql2 and the geocode providers. And the
// ranking rule is the part that decides which hospital a reader is sent to, so
// it deserves to be readable and testable on its own rather than living inside
// an ORDER BY clause.
//
// The defect this file exists to prevent: the lookup used to be
// `WHERE name LIKE '%榮民總醫院%' ORDER BY (name = ?), id ASC LIMIT 1` over
// every facility_type. 175 rows matched across six types, no row is *named*
// exactly 榮民總醫院, so bare insertion order decided — and the health_check
// import block has lower ids than the clinic one, so every 榮總 mention landed
// on `[health_check] 臺中榮民總醫院灣橋分院`. Adding a facility source silently
// rewrote every hospital landmark on the site.

/** A facility row, narrowed to what the ranking rule needs. */
export interface FacilityNameRow {
  name: string;
}

/**
 * Picks the one row a searchName identifies, or null when it identifies none.
 *
 * The rule, in order:
 *
 *  1. An exact-name row wins. `臺北榮民總醫院` beats every `臺北榮民總醫院X分院`
 *     regardless of length or id.
 *  2. Otherwise the shortest name wins, because a parent institution's name is
 *     a prefix of its branches' (`臺北市立聯合醫院` vs
 *     `臺北市立聯合醫院附設大安門診部`).
 *  3. If several distinct names tie at the top rank, decline. A tie means the
 *     searchName names a family, not an institution, and guessing sends the
 *     reader to an arbitrary member of it. Same uniqueness principle #65
 *     established for districts: a tier is used only when it identifies one
 *     place. The caller falls through to the district/county tiers.
 *
 * Never falls back to insertion order. Rows that share the top rank *and* the
 * same name are the same institution listed twice, so the first is taken —
 * that is deduplication, not a tie-break between different places.
 */
export function selectFacilityMatch<T extends FacilityNameRow>(
  candidates: readonly T[],
  searchName: string,
): T | null {
  if (candidates.length === 0) return null;

  const exact = candidates.filter((row) => row.name === searchName);
  const contenders = exact.length > 0 ? exact : shortestNamed(candidates);

  const distinctNames = new Set(contenders.map((row) => row.name));
  if (distinctNames.size > 1) return null;

  return contenders[0] ?? null;
}

/** Every row whose name is of the minimum length in the set. */
function shortestNamed<T extends FacilityNameRow>(
  candidates: readonly T[],
): T[] {
  const shortest = Math.min(...candidates.map((row) => row.name.length));
  return candidates.filter((row) => row.name.length === shortest);
}

/**
 * True when `general` is the less specific way of naming `specific` — every
 * character of the shorter name appears, in order, inside the longer one.
 *
 * This is what distinguishes 「一家醫院，兩條 regex」 from 「兩家醫院」. The alias
 * table deliberately carries both a branch entry and a bare family entry for
 * two families, and both fire on the same words:
 *
 *   「淡水馬偕紀念醫院」  → /淡水馬偕/            and /馬偕醫院|馬偕紀念醫院/
 *   「三軍總醫院北投分院」 → /三總北投|三軍總醫院北投/ and /三軍總醫院|三總/
 *
 * Substring containment is not enough to see it, because the registry names
 * these rows carry interleave the distinguishing word rather than prefixing it:
 * `台灣基督長老教會馬偕醫療財團法人馬偕紀念醫院` is not a substring of
 * `…財團法人淡水馬偕紀念醫院` (the 淡水 lands mid-string), and
 * `三軍總醫院附設民眾診療服務處` is not a substring of
 * `三軍總醫院北投分院附設民眾診療服務處` (分院 splits it). Subsequence sees both.
 *
 * The looseness is bounded and measured: across the 53 alias entries this
 * relation holds for exactly seven pairs — the four 三軍總醫院 branches and the
 * three city-prefixed 馬偕 branches, each against its own family's bare entry —
 * and for no pair of genuinely different institutions. 臺北 vs 臺中榮民總醫院,
 * 衛生福利部臺中醫院 vs 臺中榮民總醫院 and every 長庚/慈濟 sibling pair are all
 * correctly unrelated.
 */
function isMoreSpecificThan(specific: string, general: string): boolean {
  if (general.length >= specific.length) return false;
  let cursor = 0;
  for (const char of specific) {
    if (char === general[cursor]) cursor += 1;
    if (cursor === general.length) return true;
  }
  return false;
}

/**
 * Reduces every tier-1 hit found in one article to the single institution that
 * article identifies, or null when it identifies several (issue #87).
 *
 * `extractLocationFromText` used to walk the alias table and return on the
 * FIRST regex that matched, so an article naming 臺中榮總, 高雄長庚 and 部立桃園
 * was sent to 臺中榮總 for no better reason than that 臺中榮民總醫院 sits at
 * entry 3 and the other two further down. Position in a hand-written table is
 * not relevance.
 *
 * The rule, applied to the resolved rows rather than to the regexes:
 *
 *  1. Drop any institution that another, more specific one subsumes. Two
 *     patterns firing on the same words (see isMoreSpecificThan) is one
 *     hospital, not two, and the specific name is the one the article says.
 *  2. If exactly one distinct institution survives, use it.
 *  3. If several survive, decline. Same uniqueness principle #65 established
 *     for districts and #84 for rows within one searchName: a tier is used only
 *     when it identifies one place. The caller falls through to the
 *     district/county tiers rather than guessing.
 *
 * Deliberately NOT a frequency or position heuristic. With three hospitals
 * named side by side, mention count does not track which one the article is
 * about, and it would make the landmark flip on trivial rewording.
 *
 * Deliberately NOT a collapse-siblings-to-the-parent rule either: #84 measured
 * that no exact-name row exists for 佛教慈濟醫療財團法人, 長庚醫療財團法人 or
 * 三軍總醫院, so an article on 大林慈濟 and 斗六慈濟 has no parent row to be
 * redirected to and declines like any other multi-institution article.
 */
export function selectUniqueInstitution<T extends FacilityNameRow>(
  resolved: readonly T[],
): T | null {
  if (resolved.length === 0) return null;

  // Same institution reached through two aliases is one institution.
  const byName = new Map<string, T>();
  for (const row of resolved) {
    if (!byName.has(row.name)) byName.set(row.name, row);
  }
  const names = [...byName.keys()];

  const survivors = names.filter(
    (name) => !names.some((other) => isMoreSpecificThan(other, name)),
  );

  if (survivors.length !== 1) return null;
  return byName.get(survivors[0]) ?? null;
}

/**
 * Prominent hospitals and their aliases as they appear in news copy.
 *
 * Two rules hold for every entry, and both were violated before #84:
 *
 *  - **The searchName must exist as an exact-name `clinic` row.** The five
 *    `臺北市立聯合醫院{和平,仁愛,中興,陽明,忠孝}院區` entries were invented;
 *    the table has no 院區 naming at all, so those regexes fired, found
 *    nothing, and fell silently through to the county tier for months.
 *    scripts/verify-hospital-search-names.mjs checks this against production.
 *  - **The searchName must identify one institution.** `榮民總醫院`,
 *    `長庚醫療財團法人`, `佛教慈濟醫療財團法人`, `三軍總醫院` and
 *    `馬偕紀念醫院` each named a family of 4–18 hospitals in several cities.
 *    Where the copy carries a city the branch gets its own entry; where it
 *    does not (a bare 長庚醫院) there is deliberately no entry, and the
 *    waterfall falls through rather than guessing.
 *
 * Order no longer decides anything (#87). Every matching entry is collected and
 * handed to selectUniqueInstitution, which keeps the specific branch over the
 * bare family entry and declines when two genuinely different hospitals are
 * named. Branch entries are still listed before their family's bare entry, but
 * now only for readability. A lookup that finds no row contributes nothing.
 */
export const COMMON_HOSPITAL_PATTERNS: {
  regex: RegExp;
  searchName: string;
}[] = [
  {
    regex: /台大醫院|臺大醫院|臺灣大學醫學院附設醫院/,
    searchName: "國立臺灣大學醫學院附設醫院",
  },

  // 榮民總醫院 — four parents, each an exact-name row. A bare 榮民總醫院 with
  // no city is deliberately absent: it identifies a system, not a hospital.
  { regex: /[台臺]北榮總|[台臺]北榮民總醫院/, searchName: "臺北榮民總醫院" },
  {
    regex: /[台臺]中榮總|中榮|[台臺]中榮民總醫院/,
    searchName: "臺中榮民總醫院",
  },
  { regex: /高雄榮總|高榮|高雄榮民總醫院/, searchName: "高雄榮民總醫院" },
  { regex: /屏東榮總|屏東榮民總醫院/, searchName: "屏東榮民總醫院" },

  // 長庚 — no `長庚醫療財團法人` row exists, only the seven branches. A bare
  // 長庚醫院 names no one of them, so it has no entry.
  { regex: /林口長庚/, searchName: "長庚醫療財團法人林口長庚紀念醫院" },
  { regex: /高雄長庚/, searchName: "長庚醫療財團法人高雄長庚紀念醫院" },
  { regex: /基隆長庚/, searchName: "長庚醫療財團法人基隆長庚紀念醫院" },
  { regex: /[台臺]北長庚/, searchName: "長庚醫療財團法人台北長庚紀念醫院" },
  { regex: /桃園長庚/, searchName: "長庚醫療財團法人桃園長庚紀念醫院" },
  { regex: /嘉義長庚/, searchName: "長庚醫療財團法人嘉義長庚紀念醫院" },
  { regex: /雲林長庚/, searchName: "長庚醫療財團法人雲林長庚紀念醫院" },

  {
    regex: /成大醫院|成功大學醫學院附設醫院/,
    searchName: "國立成功大學醫學院附設醫院",
  },

  // 三軍總醫院 — the rows carry the 附設民眾診療服務處 suffix; there is no
  // plain `三軍總醫院` row, which is why the old searchName never tie-broke.
  {
    regex: /三總北投|三軍總醫院北投/,
    searchName: "三軍總醫院北投分院附設民眾診療服務處",
  },
  {
    regex: /三總基隆|三軍總醫院基隆/,
    searchName: "三軍總醫院基隆分院附設民眾診療服務處",
  },
  {
    regex: /三總松山|三軍總醫院松山/,
    searchName: "三軍總醫院松山分院附設民眾診療服務處",
  },
  {
    regex: /三總澎湖|三軍總醫院澎湖/,
    searchName: "三軍總醫院澎湖分院附設民眾診療服務處",
  },
  { regex: /三軍總醫院|三總/, searchName: "三軍總醫院附設民眾診療服務處" },

  // 馬偕 — the branches are city-prefixed, so the unprefixed row is the Taipei
  // flagship and an exact-name match for a bare 馬偕醫院 mention.
  {
    regex: /淡水馬偕/,
    searchName: "台灣基督長老教會馬偕醫療財團法人淡水馬偕紀念醫院",
  },
  {
    regex: /新竹馬偕/,
    searchName: "台灣基督長老教會馬偕醫療財團法人新竹馬偕紀念醫院",
  },
  {
    regex: /[台臺]東馬偕/,
    searchName: "台灣基督長老教會馬偕醫療財團法人台東馬偕紀念醫院",
  },
  {
    regex: /馬偕兒童醫院/,
    searchName: "台灣基督長老教會馬偕醫療財團法人馬偕兒童醫院",
  },
  {
    regex: /馬偕醫院|馬偕紀念醫院/,
    searchName: "台灣基督長老教會馬偕醫療財團法人馬偕紀念醫院",
  },

  {
    regex: /新光醫院|新光吳火獅紀念醫院/,
    searchName: "新光醫療財團法人新光吳火獅紀念醫院",
  },
  {
    regex: /國泰醫院|國泰綜合醫院/,
    searchName: "國泰醫療財團法人國泰綜合醫院",
  },
  {
    regex: /亞東醫院|亞東紀念醫院/,
    searchName: "醫療財團法人徐元智先生醫藥基金會亞東紀念醫院",
  },
  { regex: /雙和醫院|雙和/, searchName: "衛生福利部雙和醫院" },

  // 慈濟 — as with 長庚, only branches exist. A bare 慈濟醫院 has no entry.
  { regex: /花蓮慈濟/, searchName: "佛教慈濟醫療財團法人花蓮慈濟醫院" },
  { regex: /[台臺]北慈濟/, searchName: "佛教慈濟醫療財團法人台北慈濟醫院" },
  { regex: /[台臺]中慈濟/, searchName: "佛教慈濟醫療財團法人台中慈濟醫院" },
  { regex: /大林慈濟/, searchName: "佛教慈濟醫療財團法人大林慈濟醫院" },
  { regex: /斗六慈濟/, searchName: "佛教慈濟醫療財團法人斗六慈濟醫院" },
  { regex: /玉里慈濟/, searchName: "佛教慈濟醫療財團法人玉里慈濟醫院" },
  { regex: /關山慈濟/, searchName: "佛教慈濟醫療財團法人關山慈濟醫院" },
  { regex: /三義慈濟/, searchName: "佛教慈濟醫療財團法人三義慈濟中醫醫院" },

  {
    regex: /彰基|彰化基督教醫院/,
    searchName: "彰化基督教醫療財團法人彰化基督教醫院",
  },
  { regex: /奇美醫院|奇美醫療/, searchName: "奇美醫療財團法人奇美醫院" },
  { regex: /振興醫院/, searchName: "振興醫療財團法人振興醫院" },
  { regex: /萬芳醫院/, searchName: "臺北市立萬芳醫院" },

  // 臺北市立聯合醫院 — the copy says 和平醫院 / 聯合醫院和平院區, but the table
  // has no 院區 naming: it holds `臺北市立聯合醫院` and its 門診部 rows only.
  // Branch precision is unavailable in this data, so all five aliases resolve
  // to the parent, which is an exact-name row and actually exists. The five
  // per-院區 searchNames they replace matched nothing at all.
  {
    regex:
      /和平醫院|仁愛醫院|中興醫院|陽明醫院|忠孝醫院|聯合醫院(?:和平|仁愛|中興|陽明|忠孝)院區/,
    searchName: "臺北市立聯合醫院",
  },

  { regex: /童綜合醫院/, searchName: "童綜合醫療社團法人童綜合醫院" },
  { regex: /秀傳醫院/, searchName: "秀傳醫療社團法人秀傳紀念醫院" },
  { regex: /部立桃園醫院|衛福部桃園醫院/, searchName: "衛生福利部桃園醫院" },
  { regex: /部立台中醫院|衛福部台中醫院/, searchName: "衛生福利部臺中醫院" },
  { regex: /部立台南醫院|衛福部台南醫院/, searchName: "衛生福利部臺南醫院" },
  { regex: /部立花蓮醫院|衛福部花蓮醫院/, searchName: "衛生福利部花蓮醫院" },
  { regex: /部立台東醫院|衛福部台東醫院/, searchName: "衛生福利部臺東醫院" },
  { regex: /部立基隆醫院|衛福部基隆醫院/, searchName: "衛生福利部基隆醫院" },
  { regex: /部立台北醫院|衛福部台北醫院/, searchName: "衛生福利部臺北醫院" },
  {
    regex: /中國醫藥大學附設醫院|中國附醫/,
    searchName: "中國醫藥大學附設醫院",
  },
  {
    regex: /中山醫學大學附設醫院|中山附醫/,
    searchName: "中山醫學大學附設醫院",
  },
  {
    regex: /高雄醫學大學附設中和紀念醫院|高醫附醫|高醫/,
    searchName: "高雄醫學大學附設中和紀念醫院",
  },
  { regex: /義大醫院/, searchName: "義大醫療財團法人義大醫院" },
];
