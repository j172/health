// Unit tests for resolveAdministrativeArea — run with `npm test`.
//
// Same setup as locationPrecision.test.mjs: node:test + node:assert only, plus a
// resolve hook so extensionless relative imports find their .ts file the way
// tsconfig's "bundler" resolution and the Next build already do. Requires
// Node >= 22.18 for unflagged type stripping. See that file for the full rationale.
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

const { resolveAdministrativeArea } = await import("./administrativeArea.ts");
const { TAIWAN_DISTRICT_COORDINATES } = await import(
  "./data/taiwanDistricts.ts"
);

/** Asserts a `match` outcome and returns it, so each test reads as one line. */
function expectMatch(text) {
  const outcome = resolveAdministrativeArea(text);
  assert.equal(
    outcome.kind,
    "match",
    `expected a match for ${JSON.stringify(text)}, got ${outcome.kind}`,
  );
  return outcome.match;
}

// ---------------------------------------------------------------------------
// The decision table, row by row.
// ---------------------------------------------------------------------------

test("exactly one district: that district", () => {
  const match = expectMatch("新北市永和區衛生所今日提供流感疫苗接種");
  assert.equal(match.locationName, "新北市永和區");
  assert.equal(match.matchType, "district");
});

test("several districts all in one county: that county, not one of the districts", () => {
  // 「高雄市各區停班停課」-shaped copy. Many districts, one unambiguous county —
  // 📍高雄市 is the right badge, and picking whichever district sorts first is not.
  const match = expectMatch(
    "高雄市三民區、高雄市左營區、高雄市苓雅區、高雄市鳳山區今日停班停課",
  );
  assert.equal(match.locationName, "高雄市");
  assert.equal(match.matchType, "county");
});

test("several districts across several counties: no landmark", () => {
  // Falls through to the county tier, which sees both counties and declines.
  // (Every district match implies its own county name is present in the text, so
  // this fall-through always lands on a multi-county count.)
  assert.equal(
    resolveAdministrativeArea("台北市大安區與台中市西屯區同步開設門診")
      .kind,
    "ambiguous",
  );
});

test("exactly one county: that county", () => {
  const match = expectMatch("屏東縣衛生局公布本週登革熱疫情");
  assert.equal(match.locationName, "屏東縣");
  assert.equal(match.matchType, "county");
});

test("several counties: no landmark at all", () => {
  const outcome = resolveAdministrativeArea(
    "今日臺南市及屏東縣地區有局部大雨或豪雨，嘉義縣亦須注意",
  );
  assert.equal(outcome.kind, "ambiguous");
  assert.equal(outcome.match, undefined);
});

test("no county or district named: none, so the caller can still try the geocoder", () => {
  // `none` must stay distinct from `ambiguous`: this text should keep reaching
  // tier 4, whereas the multi-county case above must not.
  assert.equal(
    resolveAdministrativeArea("衛福部公布最新食安抽驗結果").kind,
    "none",
  );
});

// ---------------------------------------------------------------------------
// The regression that motivated the ticket (issue #65).
// ---------------------------------------------------------------------------

test("regression: the CWA bulletin with every township name yields NO landmark", () => {
  // /news/862449 — a 豪雨特報 about 臺南市 and 屏東縣 whose detail_text carried the
  // inline SVG map's <desc> for every township in Taiwan, and was badged
  // 台北市中正區 because that is TAIWAN_DISTRICT_COORDINATES[0]. Reproduced here
  // from the table itself so it cannot rot as the table grows.
  const everyDistrictName = TAIWAN_DISTRICT_COORDINATES.map(
    (district) => district.fullName,
  ).join(" ");
  const text = `今(29)日臺南市及屏東縣地區有局部大雨或豪雨 ${everyDistrictName}`;

  const outcome = resolveAdministrativeArea(text);
  assert.equal(outcome.kind, "ambiguous");
  assert.notEqual(outcome.match?.locationName, "台北市中正區");
});

test("regression: saturation is not rescued by array order at the county tier either", () => {
  // Same shape, but with the bare county names the SVG also carries. The old code
  // returned TAIWAN_COUNTY_CENTROIDS[0] (台北市) here.
  const everyDistrictName = TAIWAN_DISTRICT_COORDINATES.map(
    (district) => district.fullName,
  ).join(" ");
  assert.equal(
    resolveAdministrativeArea(`${everyDistrictName} 臺南市 屏東縣`).kind,
    "ambiguous",
  );
});

// ---------------------------------------------------------------------------
// Counting rules: 臺/台 spellings, and the two district branches.
// ---------------------------------------------------------------------------

test("臺 and 台 spellings of one county count as one county, not two", () => {
  // TAIWAN_COUNTY_CENTROIDS stores 台北市 and 臺北市 as separate rows. Counting
  // them separately would make every Taipei article "ambiguous".
  const match = expectMatch("臺北市與台北市兩種寫法混用的新聞稿");
  assert.equal(match.locationName, "台北市");
  assert.equal(match.matchType, "county");
});

test("a 臺-spelled district still resolves to its 台-spelled table entry", () => {
  const match = expectMatch("臺北市大安區設置快篩站");
  assert.equal(match.locationName, "台北市大安區");
  assert.equal(match.matchType, "district");
});

test("a contextual match is used when no full name appears", () => {
  // County and bare district name in different sentences — the looser branch.
  const match = expectMatch("台北市衛生局表示，本週義診改於中正區舉行");
  assert.equal(match.locationName, "台北市中正區");
  assert.equal(match.matchType, "district");
});

test("a verbatim full name wins over the looser contextual inference", () => {
  // The contextual branch would also produce 台北市中正區 here (台北市 appears, and
  // so does 中正區). Unioning the two branches would make this "several districts
  // in one county" and demote a precise, verbatim 台北市大安區 to 📍台北市.
  const match = expectMatch(
    "台北市大安區的門診異動，民眾也可洽中正區的服務據點",
  );
  assert.equal(match.locationName, "台北市大安區");
  assert.equal(match.matchType, "district");
});

test("empty text resolves to none", () => {
  assert.equal(resolveAdministrativeArea("").kind, "none");
});
