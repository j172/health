/**
 * Address normalization for the unified geocode batch job (see
 * docs/specs/phase9-opencage-geocode-batch.md, "Before querying, normalize a
 * copy of each address"). Produces a *query* string — the source `address`
 * column itself is never overwritten, this is only what gets sent to
 * OpenCage/Nominatim and used as the batch-local dedup key (see
 * geocodeBatch.ts).
 */

// Common OCR/data-entry variants that appear across the 16 facility sources'
// raw address text. Order matters only in that later replacements run on the
// output of earlier ones.
const VARIANT_REPLACEMENTS: [RegExp, string][] = [
  [/臺/g, "台"], // 臺灣/臺北 etc. -> 台灣/台北 (both providers handle 台 more reliably)
  [/　/g, " "], // full-width space
  [/[，,]/g, "，"], // normalize comma variants, collapsed below
];

// Parenthetical notes (either bracket style) that describe access/landmark
// info rather than the address itself — e.g. "台北市OO路1號(近OO捷運站)",
// "(舊址)", "（1樓）" — these routinely make otherwise-geocodable addresses
// return zero results from both providers.
const PARENTHETICAL_PATTERN = /[（(][^）)]*[）)]/g;

/** Normalizes a raw facility address into a query string for OpenCage/Nominatim. Never mutates or returns the original `address` column value. */
export function normalizeAddressForQuery(rawAddress: string): string {
  let normalized = rawAddress.trim();
  if (!normalized) return "";

  for (const [pattern, replacement] of VARIANT_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.replace(PARENTHETICAL_PATTERN, " ");
  // Collapse repeated whitespace/commas left behind by the strips above.
  normalized = normalized.replace(/\s+/g, " ").replace(/，+/g, "，").trim();
  normalized = normalized.replace(/^[，,]+|[，,]+$/g, "").trim();

  if (!normalized) return "";
  return normalized.includes("台灣") ? normalized : `${normalized}, 台灣`;
}
