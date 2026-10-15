/**
 * The FDA border-rejection dataset (data.gov.tw 6133) packs more than one
 * violation into a single 原因 string using " & ", e.g.
 * "含非法定著色劑 & 農藥殘留含量不符規定" (8 of the 28 distinct values on
 * 2026-10-15). The reason filter and the facet counts work on the individual
 * reasons, so the string is split here.
 *
 * Pure and import-free on purpose: usable from the parser, the queries and
 * tests alike.
 */
export const splitRejectionReasons = (reason: string | null | undefined): string[] =>
  (reason ?? "")
    .split(/[&＆]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
