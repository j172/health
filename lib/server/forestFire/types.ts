import type { ForestFireLevel } from "@/lib/tools/forestFire/levels";

/** One accepted, today's-date row out of the MOA ForestFireAlertWCF feed. */
export interface ForestFireRow {
  /** MOA `Code` as a string ("1".."21" recreation areas, 4-digit station codes). */
  siteCode: string;
  name: string;
  level: ForestFireLevel;
  /** ISO date (Asia/Taipei calendar date) the level applies to — upstream `CreateDate`. */
  createdDate: string;
}

export interface ForestFireRejectedRow {
  siteCode: string;
  name: string;
}

export interface ForestFireErroredRow extends ForestFireRejectedRow {
  errorMsg: string;
}

export interface ParsedForestFire {
  /** Today's rows with a recognised level and no upstream error. */
  rows: ForestFireRow[];
  /** Today's rows whose level is missing, out of range or self-contradictory. Never displayed. */
  unknownLevel: ForestFireRejectedRow[];
  /** Today's rows carrying a real `error_msg` (anything other than the string "NULL"). Never displayed. */
  errored: ForestFireErroredRow[];
  /** Rows (any code) whose CreateDate is not `today`. */
  ignoredNotToday: number;
  /** Entries that are not objects, or have no usable Code / name. */
  malformed: number;
  /** Extra rows collapsed because the same site code appeared more than once today. */
  duplicates: number;
}

/** A row as stored in `forest_fire_alerts`. */
export interface StoredForestFireRow {
  siteCode: string;
  siteName: string;
  warnLevel: number;
  /** ISO date string. */
  createdDate: string;
}

export type ForestFireSiteKind = "recreation_area" | "station";

export interface ForestFireSiteSeed {
  /** MOA `Code` (string). */
  code: string;
  /** MOA `name`; the seed test requires it to equal the feed's name. */
  name: string;
  kind: ForestFireSiteKind;
  county: string;
  /** outdoor-safety city code (lib/server/outdoorSafety/queries.ts TAIWAN_CITIES). */
  cityCode: string;
  /** 鄉鎮市區 — only the station list publishes it; null for recreation areas. */
  town: string | null;
  /** WGS84. */
  lat: number;
  lng: number;
  /** The 林火風險評估系統 (ffwi.forest.gov.tw) station_code the coordinate was read from. */
  ffwiCode: string;
  /** How the seed entry was tied to the MOA feed: same code, or (codes differ) identical name. */
  match: "code" | "name";
}

export interface ForestFireSiteItem {
  siteCode: string;
  name: string;
  kind: ForestFireSiteKind | null;
  level: ForestFireLevel;
  levelName: string;
  createdDate: string;
  /** True when `createdDate` is not today's Asia/Taipei date. */
  stale: boolean;
  county: string | null;
  cityCode: string | null;
  town: string | null;
  lat: number | null;
  lng: number | null;
}

export interface ForestFireOverview {
  /** Asia/Taipei calendar date the overview was computed for. */
  today: string;
  /** Newest created_date among the rows (null when there are none). */
  asOf: string | null;
  /** True when at least one row is dated today. */
  isCurrent: boolean;
  /** Per-level counts over today's (non-stale) rows only. */
  counts: Record<ForestFireLevel, number>;
  staleCount: number;
  /** Most dangerous first, then by code. */
  sites: ForestFireSiteItem[];
}
