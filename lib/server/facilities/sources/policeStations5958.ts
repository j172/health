import AdmZip from "adm-zip";
import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { countyForAddress, isWithinCountyBounds } from "@/lib/server/facilities/countyBounds";
import { twd97ToWgs84, type Wgs84Point } from "@/lib/server/facilities/twd97";
import { validateImportRows } from "@/lib/server/validation/importSchema";

// 內政部警政署「各縣(市)警察(分)局暨所屬分駐(派出)所地址資料」(data.gov.tw 5958) —
// a ZIP (manifest.csv + PoliceAddress1_<ROC yyyMMdd>.csv, UTF-8 with BOM) hosted on
// www.tgos.tw, 1,687 rows in the 1150930 release: 中文單位名稱, 英文單位名稱, 郵遞區號,
// 地址, 電話, POINT_X, POINT_Y (TWD97 TM2 meters).
//
// NOT registered in runSync.ts's SOURCES and NOT part of any automated workflow:
// www.tgos.tw answers HTTP 403 to BOTH the production host and GitHub Actions runners
// (egress-probe run 38764893673, 2026-10-15; the data.gov.tw API itself is reachable
// from both). A header/Referer difference is ruled out — from a residential network
// the same URL returns 200 for every User-Agent tried (none, curl, Chrome, node,
// python-requests) and with/without a Referer, so it is an IP-range block. That
// rules out the runner + SSH-loopback relay too. The established "residential-network
// manual import" pattern applies instead: run scripts/import-police-stations-5958.mjs
// by hand from a home/office network (see its header, and the six-monthly manual list
// in scripts/run-six-monthly-sync.sh), which downloads, calls parsePoliceStations()
// below, and POSTs the records to /api/admin/facilities-import.
//
// Coordinates — the spec called the 43 offshore rows "119°E zone". Measured on the real
// 1150930 file they are NOT: 澎湖 (28 rows, X≈7.8e4–1.15e5), 金門 (9 rows, X negative,
// e.g. -21575) and 連江 (7 rows) are all in the *121°E* grid with the easting simply
// extended past Taiwan's west coast, and the existing 121°E inverse converts every one
// of them to the right town (verified against an independent forward projection, see
// twd97.test.mjs). A 119°E reading of the same numbers falls in the Taiwan Strait.
// Because a publisher could one day re-issue those rows in the genuine island zone, the
// converter below still validates each point against its own address's county and, only
// when the 121°E reading falls outside that county, retries with the 119°E meridian.

export const POLICE_STATION_FACILITY_TYPE = "police_station";
export const POLICE_STATION_SOURCE_KEY = "police_station_5958";
export const POLICE_STATION_DATASET_API_URL = "https://data.gov.tw/api/v2/rest/dataset/5958";

/** The 1150930 release has 1,687 rows; a download with fewer than this is treated as truncated, never imported. */
export const POLICE_STATION_MIN_ROWS = 1000;
/** Share of rows that may lack coordinates before the snapshot is considered a projection/format change. */
const MAX_MISSING_COORDINATE_SHARE = 0.02;

const DATA_ORG = "內政部警政署";

// Critical columns only (see validateImportRows): a column renamed upstream must fail
// the import loudly, one row's blank value must not.
export const policeStationRawSchema = z.object({
  中文單位名稱: z.string().nullable(),
  英文單位名稱: z.string().nullable(),
  郵遞區號: z.string().nullable(),
  地址: z.string().nullable(),
  電話: z.string().nullable(),
  POINT_X: z.string().nullable(),
  POINT_Y: z.string().nullable(),
});

type PoliceStationRawRow = z.infer<typeof policeStationRawSchema>;

// ---------------------------------------------------------------------------
// Resolving the current download URL
// ---------------------------------------------------------------------------

interface Distribution {
  resourceFormat?: unknown;
  resourceDownloadUrl?: unknown;
}

/**
 * The file name embeds the release date (`…/1150930.zip`), so the URL changes with every
 * release and must be resolved from the data.gov.tw dataset API each run rather than
 * hard-coded. Prefers a `.zip` distribution; refuses anything that is not http(s).
 */
export function resolveLatestDownloadUrl(apiResponse: unknown): string {
  const body = apiResponse as { success?: unknown; result?: { distribution?: unknown } } | null;
  if (!body || typeof body !== "object" || body.success !== true) {
    throw new Error("data.gov.tw dataset 5958 API returned an unexpected response (success !== true)");
  }
  const distribution = Array.isArray(body.result?.distribution) ? (body.result.distribution as Distribution[]) : [];
  const urls = distribution
    .map((d) => (typeof d?.resourceDownloadUrl === "string" ? d.resourceDownloadUrl.trim() : ""))
    .filter(Boolean);
  if (urls.length === 0) {
    throw new Error("data.gov.tw dataset 5958 API listed no resourceDownloadUrl");
  }
  const chosen = urls.find((u) => /\.zip(\?|$)/i.test(u)) ?? urls[0];
  if (!/^https?:\/\//i.test(chosen)) {
    throw new Error(`data.gov.tw dataset 5958 resourceDownloadUrl is not an https URL: ${chosen.slice(0, 80)}`);
  }
  return chosen;
}

/**
 * `PoliceAddress1_1150930.csv` / `…/1150930.zip` -> `2026-09-30`. The release date in the
 * file name is the only date the data carries (data.gov.tw's modifiedDate is when the
 * metadata was touched and has repeatedly proved unreliable). Returns null rather than
 * guessing when the name has no valid ROC yyyMMdd.
 */
export function parseRocDateFromName(nameOrUrl: string): string | null {
  const base = (nameOrUrl.split("?")[0].split("#")[0].split("/").pop() ?? "").trim();
  const match = base.match(/(?<!\d)(\d{3})(\d{2})(\d{2})(?!\d)/);
  if (!match) return null;
  const year = Number(match[1]) + 1911;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Unit type
// ---------------------------------------------------------------------------

/** Longest/most specific suffix first: 竹北分局竹北小隊 is a 小隊, not a 分局. */
const UNIT_TYPE_SUFFIXES = ["小隊", "警察局", "分局", "分駐所", "派出所", "駐在所", "警察所", "檢查哨"] as const;

export function classifyPoliceUnit(name: string): string {
  const trimmed = name.trim();
  return UNIT_TYPE_SUFFIXES.find((suffix) => trimmed.endsWith(suffix)) ?? "其他";
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

export interface PoliceCoordinates extends Wgs84Point {
  /** Which TM2 central meridian the row's POINT_X/POINT_Y turned out to be in. */
  centralMeridianDeg: 121 | 119;
}

/** 烏坵 is 金門縣's northernmost township but lies at ~25.0°N 119.46°E, nowhere near the 金門縣 box. */
const WUQIU_BOX = { minLat: 24.9, maxLat: 25.1, minLng: 119.35, maxLng: 119.55 };

function pointMatchesAddressCounty(address: string, point: Wgs84Point): boolean {
  if (address.startsWith("金門縣烏坵鄉")) {
    return (
      point.lat >= WUQIU_BOX.minLat && point.lat <= WUQIU_BOX.maxLat && point.lng >= WUQIU_BOX.minLng && point.lng <= WUQIU_BOX.maxLng
    );
  }
  const county = countyForAddress(address);
  if (!county) return true; // nothing to check against — never veto on missing information
  return isWithinCountyBounds(county, point.lat, point.lng);
}

/**
 * POINT_X/POINT_Y -> WGS84. Always tries the 121°E grid first (what the real file uses for
 * every row, offshore islands included). Only when that reading falls outside the county
 * the row's own address names AND the 119°E reading falls inside it is 119°E used instead.
 * Otherwise the 121°E point is kept even if outside countyBounds' deliberately loose boxes
 * (real mountain-township stations such as 桃園市復興區 sit outside them). Returns null when
 * neither reading is a valid Taiwan coordinate.
 */
export function convertPoliceCoordinates(x: number, y: number, address: string): PoliceCoordinates | null {
  const p121 = twd97ToWgs84(x, y, { centralMeridianDeg: 121 });
  if (p121 && pointMatchesAddressCounty(address, p121)) return { ...p121, centralMeridianDeg: 121 };

  const p119 = twd97ToWgs84(x, y, { centralMeridianDeg: 119 });
  if (p119 && pointMatchesAddressCounty(address, p119)) return { ...p119, centralMeridianDeg: 119 };

  return p121 ? { ...p121, centralMeridianDeg: 121 } : null;
}

// ---------------------------------------------------------------------------
// ZIP -> records
// ---------------------------------------------------------------------------

export interface PoliceStationParseStats {
  /** Data rows in the CSV (header excluded). */
  rows: number;
  /** Dropped because 中文單位名稱 or 地址 was blank. */
  skippedMissingIdentity: number;
  /** Dropped because an earlier row had the same name and address. */
  duplicateRows: number;
  withCoordinates: number;
  withoutCoordinates: number;
  /** Rows whose own POINT_X/POINT_Y were unusable and that took a same-address row's coordinates (1 in the 1150930 release). */
  coordinatesBorrowedFromSameAddress: number;
  /** Rows whose coordinates were only valid in the 119°E zone (0 in every release seen so far). */
  coordinateZone119: number;
}

export interface ParsedPoliceStations {
  records: FacilityRecord[];
  /** `YYYY-MM-DD` release date from the CSV file name, or null if it had none. */
  dataAsOf: string | null;
  csvFileName: string;
  stats: PoliceStationParseStats;
}

const collapseSpaces = (s: string): string => toHalfwidthDigits(s).replace(/\s+/g, " ").trim();

/** `sourceId`: no government ID in this file, but name + address is unique (1,687/1,687 in the 1150930 release). */
export function buildPoliceStationSourceId(name: string, address: string): string {
  return `${name}|${address}`.slice(0, 100);
}

function pickCsvEntry(zip: AdmZip): { name: string; data: Buffer } {
  const csvEntries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && /\.csv$/i.test(e.entryName) && !/(^|\/)manifest\.csv$/i.test(e.entryName));
  if (csvEntries.length === 0) {
    throw new Error("5958 ZIP contains no data CSV (only manifest.csv or nothing) — the release layout may have changed");
  }
  const entry = csvEntries.find((e) => /PoliceAddress/i.test(e.entryName)) ?? csvEntries[0];
  return { name: entry.entryName.split("/").pop() ?? entry.entryName, data: entry.getData() };
}

export function parsePoliceStations(zipBuffer: Buffer): ParsedPoliceStations {
  if (zipBuffer.length < 4 || zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4b) {
    const preview = zipBuffer.subarray(0, 80).toString("utf8").replace(/\s+/g, " ");
    throw new Error(
      `5958 download is not a ZIP (${zipBuffer.length} bytes, starts with "${preview}") — an HTML/403 page means the host blocked this network`,
    );
  }

  const csv = pickCsvEntry(new AdmZip(zipBuffer));
  const rawRows = parseCsv(csv.data.toString("utf8")) as unknown as PoliceStationRawRow[];
  validateImportRows("Police stations (5958)", policeStationRawSchema, rawRows);

  const dataAsOf = parseRocDateFromName(csv.name);
  const stats: PoliceStationParseStats = {
    rows: rawRows.length,
    skippedMissingIdentity: 0,
    duplicateRows: 0,
    withCoordinates: 0,
    withoutCoordinates: 0,
    coordinatesBorrowedFromSameAddress: 0,
    coordinateZone119: 0,
  };

  const seen = new Set<string>();
  const records: FacilityRecord[] = [];

  for (const row of rawRows) {
    const name = collapseSpaces(row.中文單位名稱 ?? "");
    const address = collapseSpaces(row.地址 ?? "");
    if (!name || !address) {
      stats.skippedMissingIdentity++;
      continue;
    }

    const sourceId = buildPoliceStationSourceId(name, address);
    if (seen.has(sourceId)) {
      stats.duplicateRows++;
      continue;
    }
    seen.add(sourceId);

    const x = Number(row.POINT_X);
    const y = Number(row.POINT_Y);
    const coords = row.POINT_X && row.POINT_Y ? convertPoliceCoordinates(x, y, address) : null;
    if (coords?.centralMeridianDeg === 119) stats.coordinateZone119++;

    const unitType = classifyPoliceUnit(name);
    const phone = collapseSpaces(row.電話 ?? "");
    records.push({
      facilityType: POLICE_STATION_FACILITY_TYPE,
      sourceKey: POLICE_STATION_SOURCE_KEY,
      sourceId,
      name,
      address,
      phone: phone || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      serviceItem: unitType,
      serviceTime: null,
      dataOrg: DATA_ORG,
      extra: {
        unitType,
        englishName: collapseSpaces(row.英文單位名稱 ?? "") || null,
        postalCode: collapseSpaces(row.郵遞區號 ?? "") || null,
        dataAsOf,
        coordinateZone: coords?.centralMeridianDeg ?? null,
      },
    });
  }

  borrowCoordinatesFromSameAddress(records, stats);
  stats.withCoordinates = records.filter((r) => r.lat != null && r.lng != null).length;
  stats.withoutCoordinates = records.length - stats.withCoordinates;

  return { records, dataAsOf, csvFileName: csv.name, stats };
}

/**
 * The 1150930 release has one row (豐丘派出所) whose POINT_Y is a copy of its POINT_X
 * (235144.53 — nowhere near Taiwan's ~2.6e6 northings), published at the very same
 * address as 信義分局 and 信義派出所, whose coordinates are fine. A row whose own
 * coordinates are unusable takes them from another row with exactly the same address
 * (分局 and 派出所 frequently share a building, so this is common and harmless) rather
 * than showing up without a location; with no same-address donor it stays null.
 */
function borrowCoordinatesFromSameAddress(records: FacilityRecord[], stats: PoliceStationParseStats): void {
  const donorByAddress = new Map<string, FacilityRecord>();
  for (const r of records) {
    if (r.lat != null && r.lng != null && r.address && !donorByAddress.has(r.address)) donorByAddress.set(r.address, r);
  }
  for (const r of records) {
    if (r.lat != null && r.lng != null) continue;
    const donor = r.address ? donorByAddress.get(r.address) : undefined;
    if (!donor) continue;
    r.lat = donor.lat;
    r.lng = donor.lng;
    r.extra = { ...r.extra, coordinateZone: donor.extra?.coordinateZone ?? null, coordinateBorrowedFrom: donor.name };
    stats.coordinatesBorrowedFromSameAddress++;
  }
}

/**
 * Guard run before an import is allowed to replace the previous snapshot: a truncated
 * download or a projection change must stop here, not after the old rows are deleted.
 */
export function assertPoliceSnapshotSane(parsed: { records: readonly unknown[]; stats: Pick<PoliceStationParseStats, "withoutCoordinates"> }): void {
  const total = parsed.records.length;
  if (total < POLICE_STATION_MIN_ROWS) {
    throw new Error(`5958 snapshot has ${total} stations, fewer than the ${POLICE_STATION_MIN_ROWS} minimum — refusing to import a truncated file`);
  }
  const missing = parsed.stats.withoutCoordinates;
  if (missing / total > MAX_MISSING_COORDINATE_SHARE) {
    throw new Error(
      `5958 snapshot: ${missing}/${total} stations have no usable coordinates (> ${MAX_MISSING_COORDINATE_SHARE * 100}%) — the TWD97 layout may have changed`,
    );
  }
}
