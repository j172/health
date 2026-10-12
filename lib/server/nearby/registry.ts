import { facilitySearchConfigs } from "@/app/tools/facilityConfigs";

/**
 * Registry for the "/nearby" page (issue #466, parent #438 §F) — a single
 * source of truth for which facility types it queries, so the page, the
 * aggregation API, and the llms.txt/markdown generator never keep three
 * independently-drifting lists.
 *
 * "facility" kind entries are resolved straight from the same
 * `facilitySearchConfigs` every /tools/<slug> page already uses (not a
 * second, re-typed copy of facilityType/emoji/title) — see
 * app/tools/facilityConfigs.ts. "er" and "shelter" are their own data
 * layers (lib/server/emergencyRooms, lib/server/disaster) with no
 * facilitySearchConfigs entry of their own, so those two are declared here
 * directly.
 */
export type NearbyTypeKind = "facility" | "er" | "shelter";

export interface NearbyTypeDef {
  /** Stable id used as the `types=` query param value and as the result map's key. */
  key: string;
  kind: NearbyTypeKind;
  /** Only set for kind "facility" — the facilities.facility_type value to query. */
  facilityType?: string;
  label: string;
  emoji: string;
  /** One-line description of the data source, reused verbatim by the llms.txt/markdown generator. */
  description: string;
  /** For "more types" entries: the existing /tools/<slug> page with the full list + map + keyword search. */
  toolSlug?: string;
}

/** The 6 facilitySearchConfigs slugs issue #466 names as 2 of its 8 defaults' data source — reused as-is, not re-declared. */
const DEFAULT_FACILITY_SLUGS = [
  "aed",
  "clinics",
  "pharmacies",
  "public-toilets",
  "cool-spots",
  "disability-atm",
] as const;

const defaultFacilityTypes: NearbyTypeDef[] = DEFAULT_FACILITY_SLUGS.map((slug) => {
  const cfg = facilitySearchConfigs[slug];
  return {
    key: slug,
    kind: "facility",
    facilityType: cfg.facilityType,
    label: cfg.title,
    emoji: cfg.emoji,
    description: cfg.description,
    toolSlug: slug,
  };
});

/** issue #466's other 2 defaults — 急診 and 避難所 — each has its own data layer, not a facilitySearchConfigs entry. */
export const NEARBY_ER_TYPE: NearbyTypeDef = {
  key: "er",
  kind: "er",
  label: "急診即時壅塞",
  emoji: "🚑",
  description: "查詢全台急救責任醫院即時急診壅塞狀態。資料來源：衛生福利部急診即時看板。",
};

export const NEARBY_SHELTER_TYPE: NearbyTypeDef = {
  key: "shelter",
  kind: "shelter",
  label: "避難所",
  emoji: "🏕️",
  description: "查詢內政部公告之防災避難收容處所。資料來源：內政部開放資料。",
};

/** The 8 default facility types issue #466 asks "/nearby" to query on a single geolocation fix. */
export const NEARBY_DEFAULT_TYPES: NearbyTypeDef[] = [...defaultFacilityTypes, NEARBY_ER_TYPE, NEARBY_SHELTER_TYPE];

/**
 * "更多類型" (issue #466 acceptance criterion 3) expansion candidates: every
 * other /tools facility-search page not already one of the 8 defaults above.
 * Each is lazy-loaded one at a time when the user actually expands to see it
 * — see components/Nearby/NearbyContent.tsx — never prefetched in bulk.
 */
export const NEARBY_MORE_TYPES: NearbyTypeDef[] = Object.entries(facilitySearchConfigs)
  .filter(([slug]) => !(DEFAULT_FACILITY_SLUGS as readonly string[]).includes(slug))
  .map(([slug, cfg]) => ({
    key: slug,
    kind: "facility" as const,
    facilityType: cfg.facilityType,
    label: cfg.title,
    emoji: cfg.emoji,
    description: cfg.description,
    toolSlug: slug,
  }));

const ALL_TYPES_BY_KEY: Map<string, NearbyTypeDef> = new Map(
  [...NEARBY_DEFAULT_TYPES, ...NEARBY_MORE_TYPES].map((def) => [def.key, def]),
);

/** Resolves a `types=` query param value (a default or "more types" key) to its definition, or undefined if unknown. */
export function findNearbyTypeDef(key: string): NearbyTypeDef | undefined {
  return ALL_TYPES_BY_KEY.get(key);
}

/** The full default key list, in display order — the aggregation API falls back to this when no `types=` param is given. */
export const NEARBY_DEFAULT_TYPE_KEYS: string[] = NEARBY_DEFAULT_TYPES.map((def) => def.key);

/**
 * Hard cap on how many types a single /api/nearby request may query at once
 * (2.0 plan §F: "單次請求最多 8 個類型查詢") — matches the 8 defaults exactly,
 * so the initial load uses the whole budget and "更多類型" expansion always
 * queries strictly one type at a time per request instead of batching.
 */
export const NEARBY_MAX_TYPES_PER_REQUEST = 8;
