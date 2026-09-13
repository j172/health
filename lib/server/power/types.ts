/**
 * Types shared across the 全台電力概況儀表板 (issue #177) sync + query layer.
 * Three independent open-data sources, integrated into one dashboard page —
 * see docs/specs/taipower-energy-dashboard.md for the corrected field-shape
 * findings (most notably: d525001 is NOT scheduled-outage data).
 */

/** One row of 台電 d006001 — per-unit real-time generation (~10-minute cadence). */
export interface GenerationUnitRecord {
  unitName: string;
  unitType: string;
  capacityMw: number | null;
  netGenerationMw: number | null;
  capacityRatioPct: number | null;
  remark: string | null;
  /** The payload's top-level `DateTime`, shared by every row in that fetch. */
  sourceDatetime: string | null;
}

/** One row of 經濟部能源署 set_id=55 — national generation-source mix (~4 rows total). */
export interface GenerationMixRecord {
  sourceCategory: string;
  capacityMw: number | null;
  capacityRatioPct: number | null;
  dataOrg: string | null;
}

/**
 * One row of 台電 d525001 — radiation dose-rate monitoring stations around
 * Taipower's nuclear plants (安全監測), NOT outage data (see module doc above).
 */
export interface RadiationStationRecord {
  stationNo: string;
  stationName: string;
  doseRateUsvH: number | null;
  /** MySQL DATETIME string, parsed from the source's "YYYYMMDDTHHMMSS" timestamp. */
  recordedAt: string | null;
  lat: number | null;
  lng: number | null;
}
