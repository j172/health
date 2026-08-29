// Unit tests for planLandmarkTransition — the decision half of the landmark
// backfill (issue #72). Run with `npm test`.
//
// Same setup as administrativeArea.test.mjs / locationPrecision.test.mjs:
// node:test + node:assert only, no framework, plus a resolve hook so
// extensionless relative imports find their .ts file the way tsconfig's
// "bundler" resolution and the Next build already do. Requires Node >= 22.18 for
// unflagged type stripping. See locationPrecision.test.mjs for the full rationale.
//
// Only `landmarkTransition.ts` is imported, never `landmarkBackfill.ts`: the
// latter pulls in "server-only", mysql2 and a live DB connection. That split is
// the whole reason this module exists as its own file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(specifier + extension, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { planLandmarkTransition, isNewFacilityMatch } = await import(
  "./landmarkTransition.ts"
);
const { resolveAdministrativeArea } = await import("./administrativeArea.ts");
const { TAIWAN_DISTRICT_COORDINATES, TAIWAN_COUNTY_CENTROIDS } = await import(
  "./data/taiwanDistricts.ts"
);

/**
 * Today's extraction for a text that names no hospital, expressed exactly as
 * `geoExtractor.ts` expresses it: tier 1 needs the live `facilities` table and
 * tier 4 is off in the backfill, so tiers 2+3 — `resolveAdministrativeArea` —
 * ARE the extraction for every row in these fixtures. Keeping this three lines
 * long is deliberate: the tier rules themselves are already covered by
 * administrativeArea.test.mjs, and what is under test here is what the backfill
 * does with the answer.
 */
function extractToday(text) {
  const area = resolveAdministrativeArea(text);
  if (area.kind !== "match") return null;
  return { ...area.match, facilityId: null };
}

const district = (fullName) => {
  const row = TAIWAN_DISTRICT_COORDINATES.find((d) => d.fullName === fullName);
  assert.ok(row, `fixture district ${fullName} is missing from the table`);
  return row;
};

const county = (name) => {
  const row = TAIWAN_COUNTY_CENTROIDS.find((c) => c.name === name);
  assert.ok(row, `fixture county ${name} is missing from the table`);
  return row;
};

/** The four landmark columns as a pre-#65 row would hold them for a district. */
const storedDistrict = (fullName) => {
  const row = district(fullName);
  return {
    lat: row.lat,
    lng: row.lng,
    locationName: row.fullName,
    facilityId: null,
  };
};

/** …and for a county. */
const storedCounty = (name) => {
  const row = county(name);
  return { lat: row.lat, lng: row.lng, locationName: row.name, facilityId: null };
};

// ---------------------------------------------------------------------------
// The four fixtures the spec requires.
// ---------------------------------------------------------------------------

test("unchanged: today's rules reproduce the stored district exactly", () => {
  const text = "新北市永和區衛生所今日提供流感疫苗接種";
  const plan = planLandmarkTransition(
    storedDistrict("新北市永和區"),
    extractToday(text),
  );

  assert.equal(plan.outcome, "unchanged");
  assert.equal(plan.transition, "district->district");
  assert.equal(plan.next, null, "an unchanged row must produce no write");
});

test("county->null: a multi-county bulletin loses its arbitrary county badge", () => {
  // Pre-#65 this stopped at the county tier and kept whichever county sorted
  // first in the table. There is no one landmark for a three-county 豪雨特報.
  const text = "豪雨特報：臺南市、屏東縣、嘉義縣今日嚴防大雨";
  assert.equal(resolveAdministrativeArea(text).kind, "ambiguous");

  const plan = planLandmarkTransition(storedCounty("台南市"), extractToday(text));

  assert.equal(plan.outcome, "cleared");
  assert.equal(plan.transition, "county->null");
  assert.equal(plan.next, null, "cleared means NULL all four columns");
});

test("district->county: many districts in one county demote to that county", () => {
  const text =
    "高雄市三民區、高雄市左營區、高雄市苓雅區、高雄市鳳山區今日停班停課";
  const plan = planLandmarkTransition(
    storedDistrict("高雄市三民區"),
    extractToday(text),
  );

  assert.equal(plan.outcome, "changed");
  assert.equal(plan.transition, "district->county");
  assert.equal(plan.next.locationName, "高雄市");
  assert.equal(plan.next.lat, county("高雄市").lat);
  assert.equal(plan.next.lng, county("高雄市").lng);
  assert.equal(plan.next.facilityId, null);
});

test("saturated text (every district name in Taiwan) clears to null", () => {
  // The CWA warning pages embed an inline SVG map of Taiwan, so their scraped
  // detail_text contains all 368 township names. Pre-#65 that was badged
  // TAIWAN_DISTRICT_COORDINATES[0] = 台北市中正區 on every single such row.
  // Rows scraped before #71 still hold that text; the win is that they now go
  // silent instead of confidently wrong.
  assert.equal(
    TAIWAN_DISTRICT_COORDINATES.length,
    368,
    "this fixture is about the full 368-district table",
  );
  const saturated = `豪雨特報 ${TAIWAN_DISTRICT_COORDINATES.map(
    (d) => d.fullName,
  ).join("、")}`;

  assert.equal(extractToday(saturated), null);

  const plan = planLandmarkTransition(
    storedDistrict("台北市中正區"),
    extractToday(saturated),
  );
  assert.equal(plan.outcome, "cleared");
  assert.equal(plan.transition, "district->null");
});

// ---------------------------------------------------------------------------
// Edges the batch summary depends on being right.
// ---------------------------------------------------------------------------

test("a row that already stores nothing is unchanged, not cleared", () => {
  // `cleared` is the number an operator reads as "badges a live run would
  // remove". A row with nothing to remove must not inflate it.
  const plan = planLandmarkTransition(
    { lat: null, lng: null, locationName: null, facilityId: null },
    null,
  );
  assert.equal(plan.outcome, "unchanged");
  assert.equal(plan.transition, "null->null");
});

test("DECIMAL(10,7) rounding does not count as a change", () => {
  // Stored lat/lng come back rounded to seven decimals; the centroid tables are
  // full doubles. Without the epsilon every row would report as changed.
  const row = district("新北市永和區");
  const stored = {
    lat: Math.round(row.lat * 1e7) / 1e7,
    lng: Math.round(row.lng * 1e7) / 1e7,
    locationName: row.fullName,
    facilityId: null,
  };
  const plan = planLandmarkTransition(stored, {
    lat: row.lat,
    lng: row.lng,
    locationName: row.fullName,
    facilityId: null,
    matchType: "district",
  });
  assert.equal(plan.outcome, "unchanged");
});

test("a moved centroid under the same name is a change", () => {
  // #78 replaced the 122-row district table with 368 rows; a same-named district
  // whose coordinates moved must still be rewritten.
  const row = district("新北市永和區");
  const plan = planLandmarkTransition(
    { lat: row.lat + 0.01, lng: row.lng, locationName: row.fullName, facilityId: null },
    { ...row, locationName: row.fullName, facilityId: null, matchType: "district" },
  );
  assert.equal(plan.outcome, "changed");
  assert.equal(plan.transition, "district->district");
});

test("*->facility is reported separately from the rules changing", () => {
  // Tier 1 consults the live `facilities` table, which has grown since many rows
  // were ingested. These rows are an improvement, not the new rules disagreeing,
  // so the summary counts them on their own line.
  const plan = planLandmarkTransition(storedCounty("台北市"), {
    lat: 25.0417,
    lng: 121.5157,
    locationName: "國立臺灣大學醫學院附設醫院",
    facilityId: 4242,
    matchType: "facility",
  });

  assert.equal(plan.outcome, "changed");
  assert.equal(plan.transition, "county->facility");
  assert.equal(isNewFacilityMatch(plan), true);
  assert.equal(plan.next.facilityId, 4242);
});

test("an unchanged facility row is not counted as a new facility match", () => {
  const stored = {
    lat: 25.0417,
    lng: 121.5157,
    locationName: "國立臺灣大學醫學院附設醫院",
    facilityId: 4242,
  };
  const plan = planLandmarkTransition(stored, {
    ...stored,
    matchType: "facility",
  });
  assert.equal(plan.outcome, "unchanged");
  assert.equal(isNewFacilityMatch(plan), false);
});
