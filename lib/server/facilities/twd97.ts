/**
 * TWD97 TM2 (121°E central meridian, the zone Taiwan's six-city open-data
 * exports almost always use) meter coordinates → WGS84 decimal degrees.
 *
 * Issue #606: 臺中市公私協力及私立托嬰中心 (dataset 83669) ships its own
 * X坐標/Y坐標 columns in this projection instead of lat/lng, unlike every
 * other childcare-center source in this family (Taipei/New Taipei/Taoyuan/
 * Tainan/Kaohsiung all ship lat/lng directly or only need address
 * geocoding). No existing lib/server helper did this conversion yet — the
 * only prior art is `scripts/import-tgos-geocode-results.mjs`'s
 * `twd97ToWgs84`, which lives outside this app's TS/Next.js bundling
 * boundary (plain .mjs script, not imported by any server code) — this is
 * an independent copy of the same inverse Gauss-Krüger projection formula
 * for use from `lib/server`, not a shared import between the two.
 */

export interface Wgs84Point {
  lat: number;
  lng: number;
}

/** Generous bounding box around Taiwan (incl. outlying islands) — used to reject a conversion that clearly went wrong (e.g. swapped X/Y, wrong zone). */
const TAIWAN_BOUNDS = { minLat: 21.4, maxLat: 26.4, minLng: 118.0, maxLng: 122.3 };

export function isWithinTaiwanBounds(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= TAIWAN_BOUNDS.minLat &&
    lat <= TAIWAN_BOUNDS.maxLat &&
    lng >= TAIWAN_BOUNDS.minLng &&
    lng <= TAIWAN_BOUNDS.maxLng
  );
}

/**
 * Converts one TWD97 TM2 (121°E zone) point to WGS84. Returns `null` (rather
 * than throwing) when either input isn't a finite number or the result
 * falls outside Taiwan's bounds — callers should skip the row and leave its
 * coordinates for the usual address-geocode backfill rather than storing a
 * clearly-wrong point.
 */
export function twd97ToWgs84(x: number, y: number): Wgs84Point | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const a = 6378137.0;
  const b = 6356752.314245;
  const lng0 = (121 * Math.PI) / 180;
  const k0 = 0.9999;
  const dx = 250000;
  const dy = 0;
  const e = Math.sqrt(1 - (b * b) / (a * a));

  const xAdj = x - dx;
  const yAdj = y - dy;

  const M = yAdj / k0;
  const mu = M / (a * (1 - (e * e) / 4 - (3 * e ** 4) / 64 - (5 * e ** 6) / 256));
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));

  const J1 = (3 * e1) / 2 - (27 * e1 ** 3) / 32;
  const J2 = (21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32;
  const J3 = (151 * e1 ** 3) / 96;
  const J4 = (1097 * e1 ** 4) / 512;

  const fp = mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu);

  const e2 = Math.sqrt((a * a - b * b) / (b * b));
  const C1 = e2 * e2 * Math.cos(fp) * Math.cos(fp);
  const T1 = Math.tan(fp) * Math.tan(fp);
  const R1 = (a * (1 - e * e)) / Math.pow(1 - e * e * Math.sin(fp) * Math.sin(fp), 1.5);
  const N1 = a / Math.sqrt(1 - e * e * Math.sin(fp) * Math.sin(fp));

  const D = xAdj / (N1 * k0);

  const Q1 = (N1 * Math.tan(fp)) / R1;
  const Q2 = (D * D) / 2;
  const Q3 = ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e2 * e2) * Math.pow(D, 4)) / 24;
  const Q4 = ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e2 * e2 - 3 * C1 * C1) * Math.pow(D, 6)) / 720;
  const lat = fp - Q1 * (Q2 - Q3 + Q4);

  const Q5 = D;
  const Q6 = ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6;
  const Q7 = ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e2 * e2 + 24 * T1 * T1) * Math.pow(D, 5)) / 120;
  const lng = lng0 + (Q5 - Q6 + Q7) / Math.cos(fp);

  const result = {
    lat: Number(((lat * 180) / Math.PI).toFixed(7)),
    lng: Number(((lng * 180) / Math.PI).toFixed(7)),
  };

  return isWithinTaiwanBounds(result.lat, result.lng) ? result : null;
}
