// Unit tests for selectFacilityMatch and the hospital alias table (issue #84) —
// run with `npm test`.
//
// Same setup as administrativeArea.test.mjs / locationPrecision.test.mjs:
// node:test + node:assert only, no framework, plus a resolve hook so the
// extensionless relative import finds its .ts file the way tsconfig's "bundler"
// resolution and the Next build already do. Requires Node >= 22.18 for
// unflagged type stripping. See locationPrecision.test.mjs for the rationale.
//
// facilityMatch.ts deliberately has no imports of its own, so nothing here
// needs the "server-only" or "@/" stubbing that fetchDetailPage.test.mjs does.
//
// The fixtures are real rows, copied from the production
// /api/facilities?type=clinic responses that
// scripts/verify-hospital-search-names.mjs queries. The point of #84 was that
// invented names silently match nothing, so invented fixtures would be a poor
// way to test the fix.
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

const { selectFacilityMatch, COMMON_HOSPITAL_PATTERNS } = await import(
  "./facilityMatch.ts"
);

/** Builds rows in the shape the SQL returns, ids ascending as the DB would. */
const rows = (...names) => names.map((name, index) => ({ id: index + 1, name }));

// ---------------------------------------------------------------------------
// The ranking rule
// ---------------------------------------------------------------------------

test("no candidates: declines", () => {
  assert.equal(selectFacilityMatch([], "臺北榮民總醫院"), null);
});

test("single candidate: that row, exact name or not", () => {
  const [only] = rows("佛教慈濟醫療財團法人花蓮慈濟醫院");
  assert.equal(
    selectFacilityMatch([only], "佛教慈濟醫療財團法人花蓮慈濟醫院"),
    only,
  );
  assert.equal(selectFacilityMatch([only], "花蓮慈濟醫院"), only);
});

test("exact name wins over a shorter non-exact name", () => {
  // The regression case in reverse: the exact row must win even when another
  // row's name sorts ahead of it on every other criterion (shorter, lower id).
  const candidates = rows("北榮分院", "臺北榮民總醫院");
  const picked = selectFacilityMatch(candidates, "臺北榮民總醫院");
  assert.equal(picked.name, "臺北榮民總醫院");
});

test("exact name wins over lower-id branches — the #84 regression", () => {
  // Real 榮總 clinic rows, in id order. Before the fix the winner was whichever
  // row was imported first; now the parent wins because it is named exactly.
  const candidates = [
    { id: 70957, name: "臺北榮民總醫院" },
    { id: 71014, name: "臺北榮民總醫院桃園分院" },
    { id: 71096, name: "臺北榮民總醫院員山分院" },
    { id: 71102, name: "臺北榮民總醫院玉里分院" },
  ];
  assert.equal(selectFacilityMatch(candidates, "臺北榮民總醫院").id, 70957);
});

test("shortest name wins among non-exact rows", () => {
  // No row is named exactly `馬偕紀念醫院`; the unprefixed Taipei row is the
  // shortest, and it is the parent institution.
  const candidates = rows(
    "台灣基督長老教會馬偕醫療財團法人台東馬偕紀念醫院",
    "台灣基督長老教會馬偕醫療財團法人馬偕紀念醫院",
    "台灣基督長老教會馬偕醫療財團法人新竹馬偕紀念醫院",
  );
  const picked = selectFacilityMatch(candidates, "馬偕紀念醫院");
  assert.equal(picked.name, "台灣基督長老教會馬偕醫療財團法人馬偕紀念醫院");
});

test("shortest wins regardless of id order", () => {
  const candidates = [
    { id: 1, name: "臺北市立聯合醫院附設大安門診部" },
    { id: 2, name: "臺北市立聯合醫院附設中山門診部" },
    { id: 3, name: "臺北市立聯合醫院" },
  ];
  assert.equal(selectFacilityMatch(candidates, "市立聯合醫院").id, 3);
});

test("several distinct names tie at the shortest length: declines", () => {
  // `長庚醫療財團法人` — the old generic searchName. Seven equally-long branch
  // names, none exact. id ASC used to pick one; now nothing is picked and the
  // waterfall falls through to the district/county tiers.
  const candidates = rows(
    "長庚醫療財團法人台北長庚紀念醫院",
    "長庚醫療財團法人林口長庚紀念醫院",
    "長庚醫療財團法人高雄長庚紀念醫院",
  );
  assert.equal(selectFacilityMatch(candidates, "長庚醫療財團法人"), null);
});

test("declines even when one tied row is an obvious flagship", () => {
  // No length or id signal may stand in for a name the copy did not carry.
  const candidates = rows("佛教慈濟醫療財團法人花蓮慈濟醫院", "佛教慈濟醫療財團法人台北慈濟醫院");
  assert.equal(selectFacilityMatch(candidates, "佛教慈濟醫療財團法人"), null);
});

test("identical names at the top rank are one institution, not a tie", () => {
  // Two `長庚牙醫診所` rows really do exist. Same name is a duplicate listing,
  // not two candidate landmarks, so it must not trigger the decline path.
  const candidates = [
    { id: 97017, name: "長庚牙醫診所" },
    { id: 100248, name: "長庚牙醫診所" },
  ];
  assert.equal(selectFacilityMatch(candidates, "長庚牙醫診所").id, 97017);
});

test("insertion order never decides between differently-named rows", () => {
  // Same rows, both orders, same outcome — the property `id ASC` violated.
  const a = { id: 1, name: "臺中榮民總醫院嘉義分院" };
  const b = { id: 2, name: "臺中榮民總醫院" };
  assert.equal(selectFacilityMatch([a, b], "臺中榮民總醫院").id, 2);
  assert.equal(selectFacilityMatch([b, a], "臺中榮民總醫院").id, 2);
});

// ---------------------------------------------------------------------------
// The alias table
// ---------------------------------------------------------------------------

/** The searchName the waterfall would try first for a piece of copy. */
const firstSearchName = (text) =>
  COMMON_HOSPITAL_PATTERNS.find(({ regex }) => regex.test(text))?.searchName ??
  null;

test("no searchName names a family rather than an institution", () => {
  // The five generic names #84 was filed over. Any reappearance is the defect
  // coming back: they match 4–18 hospitals across several cities.
  const banned = new Set([
    "榮民總醫院",
    "長庚醫療財團法人",
    "佛教慈濟醫療財團法人",
    "三軍總醫院",
    "馬偕紀念醫院",
  ]);
  for (const { searchName } of COMMON_HOSPITAL_PATTERNS) {
    assert.ok(!banned.has(searchName), `${searchName} identifies no one hospital`);
  }
});

test("the five 院區 searchNames that matched nothing are gone", () => {
  for (const { searchName } of COMMON_HOSPITAL_PATTERNS) {
    assert.ok(
      !/院區$/.test(searchName),
      `${searchName} — the facilities table has no 院區 naming`,
    );
  }
});

test("each branch alias resolves to its own hospital, not a shared parent", () => {
  assert.equal(firstSearchName("臺中榮民總醫院醫材廠商調查報告"), "臺中榮民總醫院");
  assert.equal(firstSearchName("台北榮總今日公布"), "臺北榮民總醫院");
  assert.equal(firstSearchName("高榮急診壅塞"), "高雄榮民總醫院");
  assert.equal(
    firstSearchName("林口長庚醫院研究團隊"),
    "長庚醫療財團法人林口長庚紀念醫院",
  );
  assert.equal(
    firstSearchName("花蓮慈濟醫院義診"),
    "佛教慈濟醫療財團法人花蓮慈濟醫院",
  );
  assert.equal(
    firstSearchName("三總北投分院說明"),
    "三軍總醫院北投分院附設民眾診療服務處",
  );
});

test("branch entries precede the parent they would otherwise be swallowed by", () => {
  assert.equal(
    firstSearchName("三軍總醫院澎湖分院"),
    "三軍總醫院澎湖分院附設民眾診療服務處",
  );
  assert.equal(firstSearchName("三軍總醫院"), "三軍總醫院附設民眾診療服務處");
  assert.equal(
    firstSearchName("淡水馬偕紀念醫院"),
    "台灣基督長老教會馬偕醫療財團法人淡水馬偕紀念醫院",
  );
  assert.equal(
    firstSearchName("馬偕醫院"),
    "台灣基督長老教會馬偕醫療財團法人馬偕紀念醫院",
  );
});

test("a city-less 長庚 or 慈濟 mention has no entry and falls through", () => {
  assert.equal(firstSearchName("長庚醫院院方回應"), null);
  assert.equal(firstSearchName("慈濟醫院院方回應"), null);
  assert.equal(firstSearchName("榮民總醫院院方回應"), null);
});

test("the 聯合醫院 aliases resolve to the parent that actually exists", () => {
  for (const text of [
    "和平醫院",
    "聯合醫院仁愛院區",
    "中興醫院",
    "陽明醫院",
    "忠孝醫院",
  ]) {
    assert.equal(firstSearchName(text), "臺北市立聯合醫院", text);
  }
});
