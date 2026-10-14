// Issue #602: merges the Ministry of Education's own public/private-only
// kindergarten directory (k1_new.json, see scripts/import-moe-kindergartens.mjs)
// with kiang/ap.ece.moe.edu.tw's `preschools.json` — a MIT-licensed, community-
// maintained mirror of 全國教保資訊網 (https://ap.ece.moe.edu.tw/) that carries
// three fields MOE's own open-data export doesn't: a finer 公立/非營利/準公共/
// 私立 classification, the monthly fee, and a penalty-record flag.
//
// kiang is NOT an official government API. If it ever stops being updated,
// silently continuing to serve its last successful snapshot forever would mean
// surfacing stale category/fee/penalty data as if it were current — worse than
// not showing it at all. mergeKindergartenSources() guards against that: when
// `kiangFetchedAt` is more than 60 days old, every kiang-derived field is
// dropped and the output is byte-for-byte identical to what a call with zero
// kiang records would produce.

const KIANG_STALE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/**
 * Strips kiang's bracketed postal-code prefix (e.g. `[701]中華東路二段185巷14號`
 * → `中華東路二段185巷14號`). Exported for reuse by any address-based matching
 * — kiang's `address` field never includes the city name (unlike MOE's `地址`,
 * which does), so the two sources' address strings aren't directly comparable
 * even after this strip; see the module doc comment on
 * `mergeKindergartenSources` for why name+city is used instead.
 */
export function stripPostalPrefix(address) {
  return (address || "").replace(/^\[\d+\]/, "").trim();
}

function normalizeForMatch(value) {
  return (value || "").replace(/臺/g, "台").replace(/\s+/g, "").trim();
}

function buildMatchKey(name, city) {
  const normalizedName = normalizeForMatch(name);
  const normalizedCity = normalizeForMatch(city);
  if (!normalizedName || !normalizedCity) return null;
  return `${normalizedCity}|${normalizedName}`;
}

/**
 * kiang's `type` property is only a 3-way split — "公立" / "非營利" / "私立"
 * (verified against a live snapshot of preschools.json: no other values
 * occur). "準公共" isn't a `type` value at all; it's a status a 私立
 * kindergarten has when it currently holds a 準公共化 contract, recorded in
 * `pre_public` as a school-year range like "113-115" ("無" or empty means no
 * current contract). Splitting 私立 this way, against the same live
 * snapshot, yields ~2,175 準公共 and ~498 非營利 records — matching issue
 * #602's stated live-verification targets (準公共約 2,000 筆、非營利約 500 筆)
 * closely enough to confirm this is the intended derivation.
 *
 * Returns null for any `type` value this mapping doesn't recognize, so an
 * unexpected future value falls back to leaving the MOE-only classification
 * in place rather than guessing.
 */
export function deriveKiangCategory(kiangRecord) {
  const type = (kiangRecord?.type || "").trim();
  if (type === "公立") return "公立";
  if (type === "非營利") return "非營利";
  if (type === "私立") {
    const prePublic = (kiangRecord?.pre_public || "").trim();
    return prePublic && prePublic !== "無" ? "準公共" : "私立";
  }
  return null;
}

/** kiang's `monthly` is almost always a number, but ~0.5% of rows carry `""` instead of a number — never 0 or null in the live data. Treat anything else non-numeric as unknown rather than coercing `""` to 0. */
function deriveMonthlyFee(rawMonthly) {
  if (typeof rawMonthly === "number" && Number.isFinite(rawMonthly)) return rawMonthly;
  if (typeof rawMonthly === "string" && rawMonthly.trim() !== "" && Number.isFinite(Number(rawMonthly.trim()))) {
    return Number(rawMonthly.trim());
  }
  return null;
}

/**
 * kiang's `penalty` field is a Chinese string — "無" or "有" — not a boolean.
 * "無" is a non-empty string, so a naive `Boolean(record.penalty)` truthiness
 * check would mark every single record as having a penalty. Only the literal
 * "有" counts.
 */
function deriveHasPenalty(rawPenalty) {
  return rawPenalty === "有";
}

/**
 * Merges MOE's kindergarten records with kiang's supplementary classification.
 *
 * @param {Array<{name: string, serviceItem: string | null, extra?: Record<string, unknown>}>} moeRecords
 *   Records already shaped per scripts/import-moe-kindergartens.mjs — each
 *   must carry `extra.city` (MOE's 縣市名稱, postal prefix already stripped)
 *   for matching.
 * @param {Array<Record<string, unknown>>} kiangRecords
 *   kiang preschools.json's `features[].properties` objects (NOT the raw
 *   GeoJSON Feature wrapper — callers pass the flattened properties array).
 * @param {Date | string | number | null | undefined} kiangFetchedAt
 *   When the kiang data currently in hand was retrieved/last confirmed fresh
 *   (the import script derives this from preschools.json's HTTP
 *   `Last-Modified` response header, so a kiang mirror that stops updating
 *   ages out on its own without any extra bookkeeping). An invalid/missing
 *   value is treated the same as "stale" — fail closed, not open.
 * @returns {Array<object>} A new array, one entry per `moeRecords` input (same
 *   order, same length). Matched rows (fresh kiang data + a name+city match
 *   that resolves to a known category) get `extra.category`/`extra.
 *   monthlyFee`/`extra.hasPenalty` added and `serviceItem` upgraded from
 *   MOE's plain 公立/私立 text to `${category}幼兒園` — `/api/facilities`'s
 *   category filter matches against `service_item` (see
 *   lib/server/facilities/queries.ts), so without this the new 非營利/準公共
 *   filter options could never actually find any rows. Every other row
 *   (stale kiang data, or no match, or a match whose `type` isn't one of the
 *   3 known values) is returned unchanged from `moeRecords`.
 */
export function mergeKindergartenSources(moeRecords, kiangRecords, kiangFetchedAt) {
  const fetchedAtMs =
    kiangFetchedAt instanceof Date ? kiangFetchedAt.getTime() : new Date(kiangFetchedAt ?? NaN).getTime();
  const isFresh = Number.isFinite(fetchedAtMs) && Date.now() - fetchedAtMs <= KIANG_STALE_MS;
  const effectiveKiangRecords = isFresh ? kiangRecords || [] : [];

  const kiangIndex = new Map();
  for (const kiangRecord of effectiveKiangRecords) {
    const key = buildMatchKey(kiangRecord?.title, kiangRecord?.city);
    // First match wins on a duplicate key — kiang's live data has none
    // observed, but this keeps the lookup deterministic if that ever changes.
    if (key && !kiangIndex.has(key)) kiangIndex.set(key, kiangRecord);
  }

  return moeRecords.map((record) => {
    const key = buildMatchKey(record.name, record.extra?.city);
    const match = key ? kiangIndex.get(key) : undefined;
    if (!match) return record;

    const category = deriveKiangCategory(match);
    if (!category) return record;

    return {
      ...record,
      serviceItem: `${category}幼兒園`,
      extra: {
        ...record.extra,
        category,
        monthlyFee: deriveMonthlyFee(match.monthly),
        hasPenalty: deriveHasPenalty(match.penalty),
      },
    };
  });
}
