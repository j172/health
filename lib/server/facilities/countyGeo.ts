import { readTransientSeedJson } from "@/lib/server/db/transientSeed";

/**
 * Exact point-in-polygon county resolution against Taiwan's real 22 county/city
 * administrative boundaries — see `data/county-boundaries/ATTRIBUTION.md` for the
 * GeoJSON's source and license. This replaces the bounding-box-based heuristic that used
 * to live in `countyBounds.ts`'s `resolveNearestCounty`, which could misclassify a point
 * that falls inside two overlapping loose boxes (confirmed for New Taipei City's 新莊區,
 * which sits inside both New Taipei's and Taipei's bounding box — Taipei's box is
 * entirely enclosed by New Taipei's, since New Taipei geographically wraps around Taipei
 * — and the old "nearest box center" fallback picked Taipei).
 *
 * Reads the GeoJSON via `readTransientSeedJson` (#741's single seed-read entry point —
 * `public/data/` first, falling back to `data/`), TTL-cached, since this ~113 KB file would
 * otherwise be re-read and re-parsed on every call.
 */

type Ring = number[][]; // [[lng, lat], ...]
type PolygonCoordinates = Ring[]; // rings[0] = outer boundary, rings[1..] = holes

interface CountyFeature {
  type: "Feature";
  properties: { name: string };
  geometry:
    | { type: "Polygon"; coordinates: PolygonCoordinates }
    | { type: "MultiPolygon"; coordinates: PolygonCoordinates[] };
}

interface CountyFeatureCollection {
  type: "FeatureCollection";
  features: CountyFeature[];
}

const SEED_FILENAME = "county-boundaries/tw-counties.geojson";

/** Loads the county boundaries GeoJSON; `null` if the seed file is missing or unparseable. */
function loadCounties(): CountyFeatureCollection | null {
  return readTransientSeedJson<CountyFeatureCollection>(SEED_FILENAME);
}

/**
 * Ray-casting point-in-polygon test for a single ring (closed loop of [lng, lat] vertices).
 * Standard even-odd-crossing algorithm: counts how many times a ray cast from the point
 * crosses the ring's edges, and the point is inside when that count is odd.
 */
function pointInRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crossesRay = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crossesRay) inside = !inside;
  }
  return inside;
}

/** A GeoJSON Polygon's `coordinates`: ring 0 is the outer boundary, any further rings are holes. */
function pointInPolygon(lat: number, lng: number, rings: PolygonCoordinates): boolean {
  if (!pointInRing(lat, lng, rings[0])) return false;
  for (let holeIndex = 1; holeIndex < rings.length; holeIndex++) {
    if (pointInRing(lat, lng, rings[holeIndex])) return false; // inside a hole cut out of the outer ring
  }
  return true;
}

/**
 * Resolves (lat, lng) to the Taiwanese county/city whose real administrative boundary
 * contains it, via exact point-in-polygon — not an approximation or nearest-match guess.
 *
 * Returns `null` when the point falls outside all 22 counties' boundaries (open sea, an
 * outlying area the simplified polygon doesn't quite reach, or a GPS fix that's simply off
 * the island) — or when the boundaries seed file itself can't be read. Callers must treat
 * `null` as "cannot determine" and show that state honestly, never fall back to guessing a
 * nearby county — a wrong guess is worse than no answer for a feature like "which county's
 * weather alerts apply to you".
 */
export function resolveCountyByPoint(lat: number, lng: number): string | null {
  const counties = loadCounties();
  if (!counties) return null;
  for (const feature of counties.features) {
    const { geometry } = feature;
    if (geometry.type === "Polygon") {
      if (pointInPolygon(lat, lng, geometry.coordinates)) return feature.properties.name;
    } else {
      for (const polygon of geometry.coordinates) {
        if (pointInPolygon(lat, lng, polygon)) return feature.properties.name;
      }
    }
  }
  return null;
}
