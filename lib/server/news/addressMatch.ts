/**
 * Finds a Taiwanese street address inside article text, for the geo waterfall's
 * last tier — the only one that spends money, since it hands what it finds to
 * OpenCage/Nominatim out of a daily budget shared with the facilities geocode
 * batch (lib/server/facilities/geocodeBudget.ts).
 *
 * The previous pattern ended on a bare `(?:路|街|大道|巷|弄|號)` after 2-20
 * arbitrary non-punctuation characters:
 *
 *   /…[縣市][^，,。\n\r ]{2,20}(?:路|街|大道|巷|弄|號)/
 *
 * In Chinese prose those characters are ordinary words, not street suffixes.
 * Measured over 40 live articles on 2026-08-31 it matched 9 of them and **none
 * was an address** — every hit was one syndicated sentence:
 *
 *   新竹縣的國中小營養午餐5大升級方案今起上路
 *            └─ the 路 of 上路 ─┘
 *
 * 上路 / 網路 / 通路 / 思路 / 馬路 / 一路 all end a clause this way. The bug was
 * masked because tier 4 is nearly unreachable — tiers 2 and 3 answer first for
 * any text naming a county — so its false positives almost never fired. Anything
 * that promoted this tier would have unmasked them, which is why the reorder in
 * #101 was stopped and this was fixed instead.
 *
 * A house number is what actually distinguishes an address from a sentence, so
 * that is now required. 「信義路三段」 with no number is deliberately rejected:
 * it is a road, not a location, and geocoding it would return the road's
 * midpoint while claiming the precision of a street address.
 */

/** Counties as they appear at the head of a written address. */
const COUNTY_PREFIX =
  "(?:[台臺][北中南東]|新北|桃園|新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|[台臺]東|澎湖|金門|連江)";

/**
 * Half- and full-width digits both appear in scraped copy — 64號 and ６４號 are
 * the same address and government sites are inconsistent about which they use.
 */
const DIGITS = "[0-9０-９]+";

/**
 * Non-greedy between the county and the number, so the capture stops at the
 * first house number rather than running through a following sentence that
 * happens to contain another one.
 */
const ADDRESS_RE = new RegExp(
  `${COUNTY_PREFIX}[縣市][^，,。、；;\\n\\r ]{2,24}?${DIGITS}\\s*號`,
);

/**
 * The matched address, or null. Pure: no I/O, no network, no DB — the geocode
 * call sits in geoExtractor, so this can be unit-tested on its own.
 */
export const matchStreetAddress = (text: string): string | null => {
  const m = text.match(ADDRESS_RE);
  return m ? m[0] : null;
};
