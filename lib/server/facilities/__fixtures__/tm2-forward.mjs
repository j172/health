// Test-only helper (not a runtime module): an *independent* forward projection
// WGS84 -> TWD97 TM2 for any central meridian, used to cross-check
// lib/server/facilities/twd97.ts's inverse.
//
// It is Krüger's n-series (Karney 2011, eqs. 35-36), a different algorithm
// family from the Snyder inverse series twd97.ts implements, so a
// forward -> inverse (or inverse -> forward) round trip is a real check
// rather than a restatement of the code under test. Used by
// twd97.test.mjs and sources/policeStations5958.test.mjs (issue #677).

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const K0 = 0.9999;
const FALSE_EASTING = 250000;

/** WGS84 degrees -> TM2 meters `{ x, y }` for the grid whose central meridian is `centralMeridianDeg`. */
export function krugerForward(latDeg, lngDeg, centralMeridianDeg) {
  const n = WGS84_F / (2 - WGS84_F);
  const A = (WGS84_A / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64 + n ** 6 / 256);
  const alpha = [
    n / 2 - (2 * n ** 2) / 3 + (5 * n ** 3) / 16 + (41 * n ** 4) / 180,
    (13 * n ** 2) / 48 - (3 * n ** 3) / 5 + (557 * n ** 4) / 1440,
    (61 * n ** 3) / 240 - (103 * n ** 4) / 140,
    (49561 * n ** 4) / 161280,
  ];
  const phi = (latDeg * Math.PI) / 180;
  const lambda = ((lngDeg - centralMeridianDeg) * Math.PI) / 180;
  const c = (2 * Math.sqrt(n)) / (1 + n);
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - c * Math.atanh(c * Math.sin(phi)));
  const xiP = Math.atan2(t, Math.cos(lambda));
  const etaP = Math.atanh(Math.sin(lambda) / Math.sqrt(1 + t * t));
  let xi = xiP;
  let eta = etaP;
  alpha.forEach((a, i) => {
    const j = 2 * (i + 1);
    xi += a * Math.sin(j * xiP) * Math.cosh(j * etaP);
    eta += a * Math.cos(j * xiP) * Math.sinh(j * etaP);
  });
  return { x: K0 * A * eta + FALSE_EASTING, y: K0 * A * xi };
}
