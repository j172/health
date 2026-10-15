import type { ChildSubsidyRule, Parity, WelfareStatus, CareType } from "./types";

export interface MatchChildSubsidiesInput {
  ageMonths: number;
  careType: CareType;
  parity: Parity;
  welfareStatus: WelfareStatus;
}

export interface MatchedChildSubsidy {
  rule: ChildSubsidyRule;
  /** `amountsByParity[input.parity]` plus the welfare-status offset for
   * `input.welfareStatus`, floored at 0. For the three kindergarten
   * fee-cap rules this is the capped monthly fee the parent still pays
   * (lower is better), not a cash amount — see `ChildSubsidyRule.notes`. */
  amount: number;
}

/**
 * Matches one family's situation against the current (non-`announced`)
 * child-subsidy rules and returns every rule that applies, each paired
 * with its computed amount.
 *
 * Pure and synchronous by design (issue #604's hard privacy requirement):
 * takes `rules` as a parameter instead of fetching them, never logs, and
 * never reads or writes any network or browser-persistence API. It is
 * called client-side from a `"use client"` component with data the server
 * component already loaded and passed down as props — nothing the user
 * selects on this page is ever sent over the network or saved anywhere.
 * (lib/server/childSubsidies/matchChildSubsidies.test.mjs statically
 * greps this file's source for those APIs, in addition to exercising the
 * matching logic itself.)
 *
 * Steps:
 * 1. Keep only `status === "in-effect"` rules — an "announced" rule (e.g.
 *    a future 0-18歲成長津貼 proposal, if one were ever mistakenly passed
 *    in alongside `policyWatch` instead of kept separate) never reaches
 *    the output, regardless of whether its ageRange/careTypes would
 *    otherwise match.
 * 2. Keep only rules whose `ageRange` contains `input.ageMonths`
 *    (inclusive at both ends; `maxMonths: null` means unbounded).
 * 3. Keep only rules whose `careTypes` includes `input.careType`.
 * 4. Compute each surviving rule's amount: `amountsByParity[parity]` plus
 *    the bonus/offset for `input.welfareStatus` (a `null` bonus counts as
 *    0), floored at 0 so a large negative fee-cap offset (used to model
 *    "免費" for low-income households at a 準公共 kindergarten) can never
 *    produce a negative "amount".
 * 5. Resolve `notCombinableWith`: for every pair of still-surviving rules
 *    where either one lists the other, drop the one with the *lower*
 *    computed amount (ties broken by original array order — the earlier
 *    rule in `rules` wins). This is the "keep the higher-value one"
 *    precedence rule issue #604 asks for, e.g. a 1-year-old sent to a
 *    quasi-public nursery matches both "0–2歲托育補助（準公共）" (higher)
 *    and, if the caller's data ever overlapped them, "育兒津貼" (lower,
 *    and in the real data excluded by careTypes anyway) — only the higher
 *    one survives.
 *
 * Original `rules` array order is preserved in the result.
 */
export function matchChildSubsidies(
  input: MatchChildSubsidiesInput,
  rules: ChildSubsidyRule[],
): MatchedChildSubsidy[] {
  const inEffect = rules.filter((rule) => rule.status === "in-effect");

  const ageAndCareMatched = inEffect.filter((rule) => {
    const { minMonths, maxMonths } = rule.ageRange;
    const ageOk = input.ageMonths >= minMonths && (maxMonths === null || input.ageMonths <= maxMonths);
    if (!ageOk) return false;
    return rule.careTypes.includes(input.careType);
  });

  const welfareOffset = (rule: ChildSubsidyRule): number => {
    if (input.welfareStatus === "lowIncome") return rule.welfareStatusBonus.lowIncome ?? 0;
    if (input.welfareStatus === "midLowIncome") return rule.welfareStatusBonus.midLowIncome ?? 0;
    return 0;
  };

  const candidates: MatchedChildSubsidy[] = ageAndCareMatched.map((rule) => {
    const base = rule.amountsByParity[input.parity];
    const amount = Math.max(0, base + welfareOffset(rule));
    return { rule, amount };
  });

  const byId = new Map(candidates.map((candidate) => [candidate.rule.id, candidate]));
  const excludedIds = new Set<string>();

  for (const candidate of candidates) {
    for (const otherId of candidate.rule.notCombinableWith) {
      const other = byId.get(otherId);
      if (!other) continue; // the conflicting rule didn't match this situation at all

      const [loser] =
        candidate.amount === other.amount
          ? // Deterministic tie-break: whichever appears first in `rules` wins.
            [rules.indexOf(candidate.rule) < rules.indexOf(other.rule) ? other : candidate]
          : candidate.amount < other.amount
            ? [candidate]
            : [other];

      excludedIds.add(loser.rule.id);
    }
  }

  return candidates.filter((candidate) => !excludedIds.has(candidate.rule.id));
}
