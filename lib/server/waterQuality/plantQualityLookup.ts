/**
 * Pure, client-safe types and helpers for the 水質 tab's 淨水場檢驗結果 section
 * (issue #676, Track B B-14; data.gov.tw 6308「水質資訊」).
 *
 * No server-only imports on purpose (same rule as hardnessLookup.ts): the
 * browser filters/sorts the plant list with these very functions, and the API
 * route uses `parsePlantKey` to validate what it is asked for.
 *
 * Two rules shape this file:
 * - What the page says about a plant's quality is only what the file says.
 *   `qualityPass` is the file's own 水質合格否 column; this site never computes
 *   a verdict from the test values, and an unmarked row is never shown as passed.
 * - Test values are strings exactly as the file spells them (`ND`, `<1`, `－－`,
 *   `0.30`). Nothing here turns them into numbers.
 */

/** The file's 水質合格否 column. `null` = blank or anything other than Y/N. */
export type PlantQualityPass = "Y" | "N";

export interface WaterPlantQualityItem {
  /** Item name as in the file, e.g. "總溶解固體量(Total Dissolved Solids)". */
  name: string;
  /** 飲用水水質標準 header cell — a number, a range ("6.0-8.5") or "－－". */
  standard: string;
  /** 單位 header cell, e.g. "mg/L", "NTU", or "－－". */
  unit: string;
  /** This plant's result, verbatim: "150", "0.30", "ND", "<1", "－－". */
  value: string;
}

/** Everything about a plant except its (large) per-item results. */
export interface WaterPlantSummary {
  /** 區處 name, e.g. "七區". */
  officeName: string;
  /** 區處代碼 (the `{0709}` in the name cell; the file's quote prefix removed). */
  officeCode: string;
  /** The `[0747044]` code in the name cell. NOT unique on its own — see plantKey. */
  plantCode: string;
  plantName: string;
  plantNameEn: string;
  address: string;
  /** The `<高雄市@Kaohsiung City>` label in the name cell, as the file spells it. */
  serviceArea: string;
  qualityPass: PlantQualityPass | null;
}

export interface WaterPlantQualityRow extends WaterPlantSummary {
  items: WaterPlantQualityItem[];
}

/** Shown wherever the plant results are shown. */
export const PLANT_QUALITY_DISCLAIMER = "依台灣自來水公司公開資料整理，非本站判定";

/**
 * A plant's identity. The 7-digit plant code alone is shared by two plants in
 * four places in the real file (e.g. 六龜 {0709} and 新威 {0710} are both
 * [0747044]); together with the 區處代碼 it is unique across all 154 rows.
 */
export const plantKey = (plant: { officeCode: string; plantCode: string }): string =>
  `${plant.officeCode}:${plant.plantCode}`;

const PLANT_KEY_PATTERN = /^(\d{1,8}):([0-9A-Za-z][0-9A-Za-z-]{0,23})$/;

/** Inverse of plantKey; null for anything that is not a well-formed key. */
export const parsePlantKey = (key: string): { officeCode: string; plantCode: string } | null => {
  const match = PLANT_KEY_PATTERN.exec(key);
  return match ? { officeCode: match[1], plantCode: match[2] } : null;
};

/** True only for a plant whose 水質合格否 is N in the file. */
export const isFailedPlant = (plant: { qualityPass: PlantQualityPass | null }): boolean => plant.qualityPass === "N";

export interface PlantQualityStats {
  total: number;
  passed: number;
  failed: number;
  /** Rows whose 水質合格否 is blank or neither Y nor N — never counted as passed. */
  unmarked: number;
}

export const summarizePlantQuality = (plants: readonly { qualityPass: PlantQualityPass | null }[]): PlantQualityStats => {
  const stats: PlantQualityStats = { total: plants.length, passed: 0, failed: 0, unmarked: 0 };
  for (const plant of plants) {
    if (plant.qualityPass === "Y") stats.passed += 1;
    else if (plant.qualityPass === "N") stats.failed += 1;
    else stats.unmarked += 1;
  }
  return stats;
};

/** Distinct service-area labels, in the order they first appear in the file. */
export const listServiceAreas = (plants: readonly { serviceArea: string }[]): string[] => {
  const seen = new Set<string>();
  for (const plant of plants) {
    if (plant.serviceArea) seen.add(plant.serviceArea);
  }
  return [...seen];
};

export interface PlantFilter {
  serviceArea?: string;
  /** Matched case-insensitively against the plant name, English name and address. */
  query?: string;
  failedOnly?: boolean;
}

/**
 * Filters the plant list. Plants the file marks N come first so the marker is
 * the first thing a visitor sees; everything else keeps the file's order.
 */
export const filterPlants = <
  T extends Pick<WaterPlantSummary, "plantName" | "qualityPass"> &
    Partial<Pick<WaterPlantSummary, "plantNameEn" | "address" | "serviceArea">>,
>(
  plants: readonly T[],
  filter: PlantFilter,
): T[] => {
  const query = (filter.query ?? "").trim().toLowerCase();
  const matches = plants.filter((plant) => {
    if (filter.serviceArea && plant.serviceArea !== filter.serviceArea) return false;
    if (filter.failedOnly && !isFailedPlant(plant)) return false;
    if (query) {
      const haystack = `${plant.plantName} ${plant.plantNameEn ?? ""} ${plant.address ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  return [...matches.filter(isFailedPlant), ...matches.filter((plant) => !isFailedPlant(plant))];
};

/** "2026-09-23" → "2026/09/23", the way the file's own footer writes it. null for nothing or garbage. */
export const formatSourceDate = (iso: string | null | undefined): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return match ? `${match[1]}/${match[2]}/${match[3]}` : null;
};
