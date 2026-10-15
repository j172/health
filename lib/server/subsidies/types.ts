/**
 * Small shared module for the hand-maintained government-subsidy/benefit
 * data files that live outside the facility-sync pipeline — currently
 * `data/child-subsidies.json` (issue #604) and `data/ltc-benefits.json`
 * (issue #615). Both read a JSON file directly in a server component and
 * feed it into a pure, synchronous, client-side matching/estimation
 * function (never a fetch, never browser storage — see each domain's own
 * `matchChildSubsidies.ts` / `estimateLtcBenefits.ts` doc comments).
 *
 * This module holds only the parts that are genuinely identical between
 * the two: the three-tier household means-tested status, and the
 * "verified against an official source as of this date" citation shape.
 * It does NOT try to unify the two domains' actual rule/amount shapes —
 * child subsidies are matched by age range + care type + parity, while LTC
 * benefits are looked up by a 2–8 need level — those are different enough
 * that forcing one generic "SubsidyRule" over both would make each harder
 * to read, not easier. See lib/server/childSubsidies/testSupport usage and
 * lib/server/ltcBenefits/testSupport usage (both actually
 * `lib/server/subsidies/testSupport.mjs`) for the other piece that's
 * genuinely shared: the freshness-tripwire and no-network/no-storage test
 * helpers.
 */

/**
 * Household means-tested welfare status, as used by both
 * `data/child-subsidies.json` (childcare/birth subsidies — issue #604) and
 * `data/ltc-benefits.json` (long-term-care benefit copay rates — issue
 * #615). Identical concept in both domains, so it's defined once here;
 * `lib/server/childSubsidies/types.ts` re-exports it under its original
 * name/path so nothing importing from there needs to change.
 *
 * NOTE for LTC benefits specifically: 長期照顧服務申請及給付辦法第14條 and
 * 附表五 actually define three *different* classes — "第一類" (列冊之低收
 * 入戶、中低收入戶，或符合中低收入老人生活津貼發給辦法第5條第1項第1款資
 * 格者), "第二類" (符合同辦法第5條第1項第2款，或身心障礙者生活補助資格
 * 者), and "第三類" (其餘，即一般戶) — with copay rates of 0%/5–10%/16–30%
 * respectively. "第一類" explicitly groups 低收入戶 and 列冊中低收入戶
 * together at the *same* 0% rate. This type's `lowIncome`/`midLowIncome`
 * map to that same "第一類" (both 0% for every LTC benefit item), and
 * `general` maps to "第三類". The narrower "第二類" population (which
 * would need 5–10%, not 0%) isn't reachable through this 3-option type —
 * see `data/ltc-benefits.json`'s `copayRates.note` field for the full
 * citation and user-facing caveat. This is a real, documented
 * simplification, not a guess at a number.
 */
export type WelfareStatus = "general" | "midLowIncome" | "lowIncome";

/**
 * Citation metadata attached to every officially-sourced fact/amount in
 * these hand-maintained data files — the discipline issue #604 established
 * (every number must cite where it came from and when it was last checked)
 * extended to a reusable shape instead of being retyped per domain.
 */
export interface SourcedFact {
  /** Direct link to the official source (government page or published PDF). */
  officialUrl: string;
  /** The specific 法條/附表 (article/schedule) this fact is drawn from, when applicable. */
  legalBasis?: string;
  /**
   * ISO 8601 date (`YYYY-MM-DD`) this fact was last confirmed against its
   * official source. Freshness-tested (`lib/server/subsidies/testSupport.mjs`'s
   * `assertFreshness`) — must stay within 180 days of "now", same rule
   * issue #604 established.
   */
  lastVerified: string;
  notes?: string;
}
