/**
 * Issue #589 (parent #583) — the "項目 → 地球資料" pure-transform module for
 * the 國際疫情 (epidemics) item, following the same contract #587's globe
 * shell set up for `lib/tools/globeWatch/*`: no DB, no DOM, no MapLibre
 * import. Input is already-queried `cdc_travel_alerts` rows (the same shape
 * `getCdcTravelAlerts()` / `CDCTravelAlertItem` returns — see
 * lib/server/cdc/queries.ts); output is a locale-agnostic, MapLibre-agnostic
 * structure the client components join against the lazily-loaded Natural
 * Earth boundary file and the country-name/disease-name dictionaries.
 */

export type EpidemicLevelCode = 1 | 2 | 3;

export interface EpidemicAlertRow {
  id: string;
  /** Raw `cdc_travel_alerts.iso` value. Usually a single ISO 3166-1 alpha-2
   * code ("TH"), but the upstream CDC CSV occasionally ships a
   * comma-joined multi-country advisory ("DZ,TD,GN,MR,NE,NG,ML,SN,ZA") —
   * see lib/server/cdc/baselineItems.ts. May be null/empty/garbage. */
  iso: string | null;
  country: string;
  countryEn: string;
  disease: string;
  /** As stored: 0 means "no level" (e.g. a lifted/解除 advisory) and never
   * contributes a color. */
  levelCode: number;
  severityLevel: string;
  instruction: string;
  web: string;
  lat: number | null;
  lng: number | null;
  effective?: string;
}

export interface EpidemicCountryDisease {
  id: string;
  iso: string;
  disease: string;
  levelCode: EpidemicLevelCode;
  severityLevel: string;
  instruction: string;
  web: string;
  country: string;
  countryEn: string;
  lat: number | null;
  lng: number | null;
  effective?: string;
}

export interface EpidemicCountryGroup {
  iso: string;
  /** The HIGHEST levelCode among this country's diseases (AC: 同一國家同時
   * 有第一級與第三級時取第三級). */
  levelCode: EpidemicLevelCode;
  diseases: EpidemicCountryDisease[];
}

export interface EpidemicPointFeature {
  id: string;
  lat: number;
  lng: number;
  disease: string;
  levelCode: EpidemicLevelCode;
  severityLevel: string;
  instruction: string;
  web: string;
  country: string;
  countryEn: string;
  effective?: string;
}

export interface EpidemicLegendEntry {
  levelCode: EpidemicLevelCode;
  /** Hex color MapLibre's fill-color/circle-color expressions consume
   * directly — see lib/tools/globeWatch/epidemicsBoundaries.ts. */
  color: string;
  labelKey: string;
}

export interface EpidemicsGlobeData {
  countries: EpidemicCountryGroup[];
  points: EpidemicPointFeature[];
  legend: EpidemicLegendEntry[];
  emptyState: boolean;
}

// Level colors chosen to match the existing travel-epidemic-alerts page's
// own 🟡🟠🔴 badge color families (emerald/amber/rose — see
// components/Epidemic/TravelEpidemicAlertsContent.tsx's getLevelBadge), so
// the carried-over list and the new choropleth never disagree about what
// color means "第三級警告".
export const EPIDEMIC_LEVEL_LEGEND: EpidemicLegendEntry[] = [
  { levelCode: 1, color: "#10b981", labelKey: "epidemics.level1Watch" },
  { levelCode: 2, color: "#f59e0b", labelKey: "epidemics.level2Alert" },
  { levelCode: 3, color: "#f43f5e", labelKey: "epidemics.level3Warning" },
];

const VALID_LEVEL_CODES: ReadonlySet<number> = new Set([1, 2, 3]);

function isValidLevelCode(value: number): value is EpidemicLevelCode {
  return VALID_LEVEL_CODES.has(value);
}

/**
 * Splits a raw `iso` field into individual, plausible ISO 3166-1 alpha-2
 * codes. Handles the single-code common case, the comma-joined
 * multi-country advisory case, and garbage (empty/null/anything that isn't
 * exactly 2 letters) by dropping it — a row with zero valid codes is
 * treated the same as "no ISO at all" by the caller.
 */
function parseIsoCodes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const code = part.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) seen.add(code);
  }
  return Array.from(seen);
}

/**
 * Groups `rows` by country (AC: 依最高等級上色 — 同一國家同時有第一級與第
 * 三級時取第三級) and falls back any row with no usable ISO code to a point
 * feature at its own lat/lng (AC: 沒有 ISO 時退回座標點，不被丟棄). Rows
 * whose `levelCode` isn't 1/2/3 (e.g. a lifted "解除" advisory, levelCode
 * 0) contribute nothing to the globe — there is no level to color or plot
 * by — but remain fully visible in the carried-over list, which doesn't go
 * through this function at all.
 */
export function buildEpidemicsGlobeData(rows: EpidemicAlertRow[]): EpidemicsGlobeData {
  const countryMap = new Map<string, EpidemicCountryGroup>();
  const points: EpidemicPointFeature[] = [];

  for (const row of rows) {
    if (!isValidLevelCode(row.levelCode)) continue;
    const levelCode = row.levelCode;
    const isoCodes = parseIsoCodes(row.iso);

    if (isoCodes.length === 0) {
      if (row.lat !== null && row.lng !== null) {
        points.push({
          id: row.id,
          lat: row.lat,
          lng: row.lng,
          disease: row.disease,
          levelCode,
          severityLevel: row.severityLevel,
          instruction: row.instruction,
          web: row.web,
          country: row.country,
          countryEn: row.countryEn,
          effective: row.effective,
        });
      }
      // No ISO and no coordinate either: nothing plottable on the globe,
      // but the row is still reachable through the carried-over list (which
      // reads straight from the API, not from this function's output).
      continue;
    }

    for (const iso of isoCodes) {
      const diseaseEntry: EpidemicCountryDisease = {
        id: row.id,
        iso,
        disease: row.disease,
        levelCode,
        severityLevel: row.severityLevel,
        instruction: row.instruction,
        web: row.web,
        country: row.country,
        countryEn: row.countryEn,
        lat: row.lat,
        lng: row.lng,
        effective: row.effective,
      };

      const existing = countryMap.get(iso);
      if (!existing) {
        countryMap.set(iso, { iso, levelCode, diseases: [diseaseEntry] });
      } else {
        existing.diseases.push(diseaseEntry);
        if (levelCode > existing.levelCode) existing.levelCode = levelCode;
      }
    }
  }

  const countries = Array.from(countryMap.values()).sort(
    (a, b) => b.levelCode - a.levelCode || a.iso.localeCompare(b.iso),
  );

  return {
    countries,
    points,
    legend: EPIDEMIC_LEVEL_LEGEND,
    emptyState: countries.length === 0 && points.length === 0,
  };
}

/** Convenience lookup used by the country-detail panel — `null` when `iso`
 * has no current alert (not an error; most countries don't). */
export function findCountryGroup(data: EpidemicsGlobeData, iso: string): EpidemicCountryGroup | null {
  const code = iso.trim().toUpperCase();
  return data.countries.find((c) => c.iso === code) ?? null;
}
