/**
 * Shared types for the hand-maintained `data/child-subsidies.json` catalog
 * (issue #604, parent spec #599). This data does NOT go through the
 * facility-sync pipeline — it's read directly by
 * `app/(zh)/tools/child-subsidies/page.tsx`, the same pattern
 * `data/government-hotlines.json` → `EmergencyHotlinesContent` already uses.
 */

/**
 * How a child is currently being cared for / educated. Drives which
 * `ChildSubsidyRule`s a given situation can match (via `careTypes`).
 *
 * - "home-care" / "private-nursery": not enrolled in any public, nonprofit,
 *   or contracted (準公共) institution — the family either cares for the
 *   child itself, uses an uncontracted babysitter, or pays full private
 *   nursery fees. Eligible for the cash allowances (育兒津貼).
 * - "public-nursery" / "quasi-public-nursery": under-2 institutional care
 *   contracted under the 公共化/準公共化 托育 scheme. Eligible for 托育補助
 *   instead of 育兒津貼 (the two are legally mutually exclusive).
 * - "public-kindergarten" / "nonprofit-kindergarten" /
 *   "quasi-public-kindergarten": the three "平價教保服務機構" kindergarten
 *   types (2 歲到入國小前) with a government-capped monthly parent fee.
 * - "private-kindergarten": a private kindergarten with no 準公共 contract
 *   — pays market rate, but (if not otherwise enrolled above) still
 *   eligible for the 2-5歲育兒津貼 / 5歲就學補助 cash allowances.
 */
export type CareType =
  | "home-care"
  | "private-nursery"
  | "public-nursery"
  | "quasi-public-nursery"
  | "public-kindergarten"
  | "nonprofit-kindergarten"
  | "quasi-public-kindergarten"
  | "private-kindergarten";

/** Every `CareType` value, for rules that apply regardless of care type
 * (the birth-grant and IVF entries, which aren't gated by how an existing
 * child is cared for at all). */
export const ALL_CARE_TYPES: CareType[] = [
  "home-care",
  "private-nursery",
  "public-nursery",
  "quasi-public-nursery",
  "public-kindergarten",
  "nonprofit-kindergarten",
  "quasi-public-kindergarten",
  "private-kindergarten",
];

/** Birth order of the child this lookup is for. Every current scheme in
 * `data/child-subsidies.json` pays more for a 2nd child and more again for
 * a 3rd-or-later child, so this is a required input, not an add-on. */
export type Parity = "first" | "second" | "thirdPlus";

/** Household welfare/means-tested status. "general" gets no bonus/offset;
 * "midLowIncome"/"lowIncome" map to `welfareStatusBonus`. */
export type WelfareStatus = "general" | "midLowIncome" | "lowIncome";

export type ChildSubsidyStatus = "in-effect" | "announced";

export interface ChildSubsidyAgeRange {
  minMonths: number;
  /** `null` means no upper bound. Every current entry sets this. */
  maxMonths: number | null;
}

export interface ChildSubsidyAmountsByParity {
  first: number;
  second: number;
  thirdPlus: number;
}

/**
 * Additive adjustment on top of `amountsByParity[parity]`, keyed by
 * `WelfareStatus`. `null` means "no confirmed official figure" — the
 * matching function treats a `null` bonus as 0, never as an error, so an
 * unresearched tier simply shows the general-household amount (see each
 * entry's `notes` for what's actually unconfirmed).
 *
 * For the three kindergarten fee-cap entries (school-fee-cap-*), these are
 * *negative* offsets, not bonuses — `amountsByParity` there holds the
 * capped monthly fee a parent still pays, and 低收/中低收 households are
 * fee-free, so the offset is sized to drive every parity tier to exactly 0
 * once `matchChildSubsidies` floors the result at 0. See that function's
 * doc comment.
 */
export interface ChildSubsidyWelfareBonus {
  midLowIncome: number | null;
  lowIncome: number | null;
}

export interface ChildSubsidyRule {
  id: string;
  name: string;
  agency: string;
  ageRange: ChildSubsidyAgeRange;
  amountsByParity: ChildSubsidyAmountsByParity;
  careTypes: CareType[];
  welfareStatusBonus: ChildSubsidyWelfareBonus;
  /** ids of other rules in the same array this one cannot be received
   * alongside. Every id listed here must exist in the array (enforced by
   * lib/server/childSubsidies/childSubsidiesData.test.mjs) — kept symmetric
   * in the data (if A excludes B, B also lists A) so `matchChildSubsidies`
   * doesn't have to guess a direction, though its resolution logic treats
   * the list as directional-safe either way. */
  notCombinableWith: string[];
  status: ChildSubsidyStatus;
  /** Required when `status === "announced"`. Not used by any entry in
   * `data/child-subsidies.json` today (that file is 100% "in-effect"); kept
   * on the type because `ChildSubsidyRule` is also the shape used to prove
   * `matchChildSubsidies` never surfaces a stray "announced" row if one
   * ever ends up in the input array by mistake. */
  announcedDate?: string;
  officialUrl: string;
  legalBasis?: string;
  /** ISO 8601 date (`YYYY-MM-DD`) this entry's amounts/eligibility were
   * last confirmed against an official source. Must be within 180 days of
   * "now" — see childSubsidiesData.test.mjs's freshness tripwire. */
  lastVerified: string;
  notes?: string;
}

/**
 * The 0-18歲成長津貼 proposals — deliberately a *separate* array/shape from
 * `ChildSubsidyRule`. Never pass these into `matchChildSubsidies`; they are
 * not in effect and the page renders them only in its neutrally-framed
 * "已宣布、尚未上路" section ("實施方式尚未確定，以主管機關公告為準").
 */
export interface PolicyWatchItem {
  id: string;
  title: string;
  proposedBy: "executive" | "legislative";
  summary: string;
  ageRange: ChildSubsidyAgeRange;
  /** ISO 8601 date, or `null` when the proposal's own timeline is
   * unresolved (e.g. still disputed between branches of government). */
  targetStartDate: string | null;
  sourceUrl: string;
  lastVerified: string;
}
