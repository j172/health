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

const appendCountry = (address: string): string => (address.includes("台灣") ? address : `${address}, 台灣`);

/** Cleans a raw address (variant/whitespace/punctuation normalization, parenthetical strip) without appending the country suffix — the shared first step for both normalizeAddressForQuery and buildQueryCandidates below. */
const cleanAddress = (rawAddress: string): string => {
  let cleaned = rawAddress.trim();
  if (!cleaned) return "";

  for (const [pattern, replacement] of VARIANT_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  cleaned = cleaned.replace(PARENTHETICAL_PATTERN, " ");
  // Collapse repeated whitespace/commas left behind by the strips above.
  cleaned = cleaned.replace(/\s+/g, " ").replace(/，+/g, "，").trim();
  cleaned = cleaned.replace(/^[，,]+|[，,]+$/g, "").trim();
  return cleaned;
};

/** Normalizes a raw facility address into a query string for OpenCage/Nominatim. Never mutates or returns the original `address` column value. */
export function normalizeAddressForQuery(rawAddress: string): string {
  const cleaned = cleanAddress(rawAddress);
  return cleaned ? appendCountry(cleaned) : "";
}

// Both OpenCage and Nominatim are ultimately backed by OSM data for Taiwan,
// so a full address (e.g. "信義路二段79巷15號之8") very often returns zero
// results even though the road itself geocodes fine — confirmed directly
// against both live APIs 2026-08-20 (ported from lib/server/facilities/
// geocode.ts's existing FALLBACK_STRIPS, which the general per-source
// geocoder already relies on for this exact reason; the batch job needs the
// same cascade or it inherits none of that real-world success rate).
// Progressively drop the most granular segment until something matches,
// trading pinpoint accuracy for at least landing on the right street.
const FALLBACK_STRIPS: RegExp[] = [
  /\d+號.*$/, // 79號 (and anything after — 之8, 一樓, etc.)
  /(\d+巷|\d+弄).*$/, // 15巷 / 15弄
];

/**
 * Builds the ordered list of query candidates for one address: the fully
 * normalized address first, then progressively-stripped fallbacks (deduped,
 * empties dropped, country suffix re-appended fresh to each — stripping has
 * to happen on the *un-suffixed* address, otherwise the greedy `.*$` in
 * FALLBACK_STRIPS eats the ", 台灣" suffix along with everything else after
 * the house number). The first candidate is also what geocodeBatch.ts uses
 * as its batch-local dedup key — two facilities sharing the exact same full
 * address should be grouped together regardless of which stripped variant
 * eventually succeeds for them.
 */
export function buildQueryCandidates(rawAddress: string): string[] {
  const base = cleanAddress(rawAddress);
  if (!base) return [];

  const candidates: string[] = [];
  const seen = new Set<string>();
  let candidate = base;

  for (let attempt = 0; attempt <= FALLBACK_STRIPS.length; attempt++) {
    if (attempt > 0) {
      candidate = candidate.replace(FALLBACK_STRIPS[attempt - 1], "").trim();
    }
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    candidates.push(appendCountry(candidate));
  }

  return candidates;
}
