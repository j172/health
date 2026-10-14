/**
 * Shared validity-date helpers for the 5 county-level 母嬰親善醫療院所
 * (baby-friendly-hospital) sources (issue #614). Each county publishes its
 * own open-data export with its own column names, and — confirmed by
 * fetching a live sample from every one of the 5 counties on 2026-10-14 —
 * two genuinely different date formats for "how long is this row valid":
 *
 *   - Taipei (121200): 效期 as an 8-digit 西元年 YYYYMMDD string, e.g.
 *     "20241231", "20271231" — varies per row (per-institution accreditation
 *     cycle).
 *   - Changhua (30882): 效期 as the free-text "NNN年底" ROC-year-end string,
 *     e.g. "116年底" — identical across all 5 of its rows (one county-wide
 *     accreditation batch, not per-institution).
 *
 * New Taipei (123291) also has a "date" column, but confirmed live it's the
 * same single value ("20260211") on all 20 rows — a batch "list last
 * updated" stamp, not a per-row expiry — so it is surfaced as display
 * metadata only and never fed through `isExpiredValidity()`. Taichung
 * (83649) and Tainan (150985) have no validity-date column of their own at
 * all. Don't assume any of these shapes apply to a county this file doesn't
 * cover without checking a live sample first — that's exactly the mistake
 * this module exists to avoid.
 */

/**
 * Parses an 8-digit 西元年 YYYYMMDD validity-date string into ISO
 * YYYY-MM-DD. Returns null (never throws) for anything that doesn't match —
 * a source sending an unexpected shape should just drop that row's expiry
 * info rather than silently miscompute a wrong date.
 */
export function isoDateFromYyyymmdd(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Parses Changhua's own textual "NNN年底" ROC-year-end validity format
 * (e.g. "116年底" = valid through the end of ROC year 116 = 2027-12-31)
 * into ISO YYYY-MM-DD.
 */
export function isoDateFromRocYearEnd(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{2,3})年底$/);
  if (!m) return null;
  const year = parseInt(m[1], 10) + 1911;
  return `${year}-12-31`;
}

/**
 * True when `validUntilIso` is a real parsed date strictly before
 * `todayIso` (defaults to the real current date). A null/unparseable date
 * is never treated as expired — a row with no expiry info of its own
 * (Taichung/Tainan have none at all) stays in by design; only a row whose
 * validity date we could actually parse AND which has passed gets dropped.
 */
export function isExpiredValidity(validUntilIso: string | null, todayIso?: string): boolean {
  if (!validUntilIso) return false;
  const now = todayIso || new Date().toISOString().slice(0, 10);
  return validUntilIso < now;
}
