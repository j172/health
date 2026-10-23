import { facilitySearchConfigs } from "@/app/(zh)/tools/facilityConfigs";

/**
 * Registry for the "/nearby" page (issue #466, #800, #801) — a single source of
 * truth for which facility types it queries, so the page, the aggregation API,
 * and the llms.txt/markdown generator never keep independently-drifting lists.
 *
 * Ordered strictly by urgency level (issue #800):
 *   1. 🔴 aed (Cardiac arrest, golden minutes)
 *   2. 🔴 er (Emergency rooms congestion & critical care)
 *   3. 🟠 police-stations (Public safety & emergency protection)
 *   4. 🟠 shelter (Disaster evacuation shelter)
 *   5. 🟡 clinics (Outpatient medical care)
 *   6. 🟡 pharmacies (Urgent pharmaceuticals & dressings)
 *   7. 🟢 public-toilets (Urgent physiological need)
 *   8. ⚪ cool-spots (Heat mitigation)
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
  /**
   * For defaults and "more types" entries: the existing /tools/<slug> page with the full list + map + keyword search
   * (for "police-stations", which has no tool page of its own: the related child-safety-spots page).
   */
  toolSlug?: string;
}

function resolveFacilityType(slug: string): NearbyTypeDef {
  const cfg = facilitySearchConfigs[slug];
  if (!cfg) throw new Error(`Missing facilitySearchConfigs entry for: ${slug}`);
  return {
    key: slug,
    kind: "facility",
    facilityType: cfg.facilityType,
    label: cfg.title,
    emoji: cfg.emoji,
    description: cfg.description,
    toolSlug: slug,
  };
}

export const NEARBY_ER_TYPE: NearbyTypeDef = {
  key: "er",
  kind: "er",
  label: "急診即時壅塞",
  emoji: "🚑",
  description: "查詢全台急救責任醫院即時急診壅塞狀態。資料來源：衛生福利部急診即時看板。",
  toolSlug: "er-status",
};

export const NEARBY_SHELTER_TYPE: NearbyTypeDef = {
  key: "shelter",
  kind: "shelter",
  label: "避難所",
  emoji: "🏕️",
  description: "查詢內政部公告之防災避難收容處所。資料來源：內政部開放資料。",
  toolSlug: "disaster-map",
};

export const NEARBY_POLICE_STATION_TYPE: NearbyTypeDef = {
  key: "police-stations",
  kind: "facility",
  facilityType: "police_station",
  label: "派出所／警察局",
  emoji: "🚓",
  description:
    "查詢離您最近的警察局、分局、分駐所與派出所的地址與電話。依內政部警政署公開資料（data.gov.tw 5958）整理，僅供參考；緊急時請直接撥打 110。",
  toolSlug: "child-safety-spots",
};

/**
 * 8 大預設急用點位（issue #800, #801）：
 * 嚴格依照「生命搶救 > 人身治安 > 防災收容 > 基層醫療 > 生理急迫 > 輔助民生」排序。
 */
export const NEARBY_DEFAULT_TYPES: readonly NearbyTypeDef[] = [
  resolveFacilityType("aed"),
  NEARBY_ER_TYPE,
  NEARBY_POLICE_STATION_TYPE,
  NEARBY_SHELTER_TYPE,
  resolveFacilityType("clinics"),
  resolveFacilityType("pharmacies"),
  resolveFacilityType("public-toilets"),
  resolveFacilityType("cool-spots"),
] as const;

export const NEARBY_DEFAULT_TYPE_KEYS: readonly string[] = NEARBY_DEFAULT_TYPES.map((def) => def.key);

const DEFAULT_KEY_SET = new Set<string>(NEARBY_DEFAULT_TYPE_KEYS);

/**
 * "更多類型" (issue #466, #800)：
 * 包含 disability-atm 與其他所有非預設 8 類的設施類型。
 */
export const NEARBY_MORE_TYPES: readonly NearbyTypeDef[] = Object.entries(facilitySearchConfigs)
  .filter(([slug]) => !DEFAULT_KEY_SET.has(slug))
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

/**
 * Hard cap on how many types a single /api/nearby request may query at once.
 * Matches the 8 defaults exactly.
 */
export const NEARBY_MAX_TYPES_PER_REQUEST = 8;
