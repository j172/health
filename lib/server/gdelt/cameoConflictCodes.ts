/**
 * Issue #774 (parent #773) — the GDELT conflict-event filter allowlist.
 *
 * GDELT's event export is "every news-reported world event" (CAMEO root
 * categories 01-20: statements, appeals, cooperation, diplomacy, ... all the
 * way up to armed conflict). The #773 spec's own acceptance criterion is
 * explicit: this item must only ever show CAMEO root category 19 (FIGHT) and
 * 20 (USE UNCONVENTIONAL MASS VIOLENCE) — "篩選清單是一個具名、有文件說明的常數，
 * 不是自由文字比對". Any other filtering approach (substring-matching event
 * descriptions, keyword lists) would both under- and over-match, and
 * silently drift as GDELT's own event text changes — a fixed numeric-code
 * allowlist from CAMEO's own published taxonomy is the only filter that
 * can't drift.
 *
 * CAMEO (Conflict and Mediation Event Observations) is the event-coding
 * ontology GDELT's event database is coded against; its root category list
 * (documented at https://parusanalytics.com/eventdata/data.dir/cameo.html)
 * groups every one of its ~300 leaf event codes under one of 20 two-digit
 * root categories. This module intentionally only allowlists the two most
 * severe ones:
 *
 * - 19 FIGHT — the general armed-conflict root category (assaults, armed
 *   clashes, military engagements, occupation, etc. — CAMEO codes 190-195).
 * - 20 USE UNCONVENTIONAL MASS VIOLENCE — the most severe root category
 *   (mass killings, ethnic cleansing, WMD use, etc. — CAMEO codes 200-204).
 *
 * The other 18 root categories (01 MAKE PUBLIC STATEMENT, 02 APPEAL, ...,
 * 18 ASSAULT is actually root 18, not a conflict category either — note
 * CAMEO's root 18 is "ASSAULT" but that root is reserved for *coercive*
 * acts short of armed conflict, e.g. sexual assault as a diplomatic protest
 * act — deliberately excluded here per the spec's exact wording) are never
 * included, however "conflict-adjacent" they might sound, because the spec's
 * whole point is a tight, auditable filter rather than a vague "anything
 * violence-sounding" net that would flood this layer with unrelated news.
 */

/** The only two CAMEO root codes this item's GDELT pipeline ever keeps. */
export type CameoConflictRootCode = "19" | "20";

export const CAMEO_CONFLICT_ROOT_CODES: readonly CameoConflictRootCode[] = ["19", "20"];

interface CameoRootCodeEntry {
  /** CAMEO's own English root-category name, verbatim from its taxonomy. */
  cameoLabel: string;
}

/** CAMEO's own name for each allowlisted root code — kept here (not just in
 * the doc comment above) so a test can assert the allowlist and its labels
 * stay in sync with CAMEO's published taxonomy. */
export const CAMEO_CONFLICT_ROOT_LABELS: Record<CameoConflictRootCode, CameoRootCodeEntry> = {
  "19": { cameoLabel: "FIGHT" },
  "20": { cameoLabel: "USE UNCONVENTIONAL MASS VIOLENCE" },
};

export function isCameoConflictRootCode(value: string | null | undefined): value is CameoConflictRootCode {
  return value === "19" || value === "20";
}
