import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

// Issue #677 (B-9): dataset 5958 派出所／分駐所／警察局 -> facilities source
// `police_station_5958`. The parser is a pure (ZIP buffer -> records) function;
// the network fetch lives in scripts/import-police-stations-5958.mjs because
// www.tgos.tw answers 403 to both the production host and GitHub runners.
//
// Fixture: 71 real rows of the 1150930 release (all 44 offshore-island rows plus a
// spread of mainland rows incl. the odd shapes), downloaded 2026-10-16 from a
// residential network. The ZIP is rebuilt in memory so the fixture stays diffable text.

const REPO_ROOT = new URL("../../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (fs.existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const {
  POLICE_STATION_FACILITY_TYPE,
  POLICE_STATION_SOURCE_KEY,
  POLICE_STATION_MIN_ROWS,
  resolveLatestDownloadUrl,
  parseRocDateFromName,
  classifyPoliceUnit,
  convertPoliceCoordinates,
  parsePoliceStations,
  assertPoliceSnapshotSane,
} = await import("./policeStations5958.ts");
const { isWithinCountyBounds } = await import("../countyBounds.ts");
const { krugerForward } = await import("../__fixtures__/tm2-forward.mjs");
const { default: AdmZip } = await import("adm-zip");

const FIXTURE_DIR = path.join(fileURLToPath(REPO_ROOT), "lib/server/facilities/__fixtures__");
const csvFixture = fs.readFileSync(path.join(FIXTURE_DIR, "police-stations-5958-sample.csv"));
const apiFixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, "data-gov-tw-5958-api-sample.json"), "utf8"));

const MANIFEST = "﻿name,schema,description\r\nPoliceAddress1_1150930.csv,,各縣(市)警察(分)局暨所屬分駐(派出)所地址資料";

function buildZip(entries) {
  const zip = new AdmZip();
  for (const [name, content] of entries) zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"));
  return zip.toBuffer();
}

const fixtureZip = () =>
  buildZip([
    ["manifest.csv", MANIFEST],
    ["PoliceAddress1_1150930.csv", csvFixture],
  ]);

// ---------------------------------------------------------------------------
// resolveLatestDownloadUrl — the file name carries the release date, so the
// URL must be resolved from the data.gov.tw API every time.
// ---------------------------------------------------------------------------

test("resolveLatestDownloadUrl: takes resourceDownloadUrl from the real data.gov.tw API shape", () => {
  assert.equal(
    resolveLatestDownloadUrl(apiFixture),
    "https://www.tgos.tw/tgos/VirtualDir/Product/9927eb8a-efed-40c0-8bc4-83121ad6834a/1150930.zip",
  );
});

test("resolveLatestDownloadUrl: prefers a .zip distribution when several are listed", () => {
  const api = {
    success: true,
    result: {
      distribution: [
        { resourceFormat: "JSON", resourceDownloadUrl: "https://example.test/a.json" },
        { resourceFormat: "CSV", resourceDownloadUrl: "https://example.test/b.zip" },
      ],
    },
  };
  assert.equal(resolveLatestDownloadUrl(api), "https://example.test/b.zip");
});

test("resolveLatestDownloadUrl: throws a descriptive error for an unusable API response", () => {
  assert.throws(() => resolveLatestDownloadUrl(null), /5958/);
  assert.throws(() => resolveLatestDownloadUrl({ success: false }), /5958/);
  assert.throws(() => resolveLatestDownloadUrl({ success: true, result: { distribution: [] } }), /resourceDownloadUrl/);
});

test("resolveLatestDownloadUrl: refuses non-http(s) URLs", () => {
  const api = { success: true, result: { distribution: [{ resourceDownloadUrl: "file:///etc/passwd" }] } };
  assert.throws(() => resolveLatestDownloadUrl(api), /https/);
});

// ---------------------------------------------------------------------------
// parseRocDateFromName — the only in-file date (data.gov.tw's modifiedDate is
// the publish click, not the release; spec §4 item 8 says to use the file's own date).
// ---------------------------------------------------------------------------

test("parseRocDateFromName: reads the ROC release date from the file name or URL", () => {
  assert.equal(parseRocDateFromName("PoliceAddress1_1150930.csv"), "2026-09-30");
  assert.equal(
    parseRocDateFromName("https://www.tgos.tw/tgos/VirtualDir/Product/9927eb8a-efed-40c0-8bc4-83121ad6834a/1150930.zip?x=1"),
    "2026-09-30",
  );
  assert.equal(parseRocDateFromName("PoliceAddress1_1160105.csv"), "2027-01-05");
});

test("parseRocDateFromName: returns null for names without a valid date instead of guessing", () => {
  assert.equal(parseRocDateFromName("PoliceAddress1.csv"), null);
  assert.equal(parseRocDateFromName("PoliceAddress1_1150230.csv"), null, "Feb 30 is not a date");
  assert.equal(parseRocDateFromName("PoliceAddress1_1151301.csv"), null, "month 13");
  assert.equal(parseRocDateFromName(""), null);
});

// ---------------------------------------------------------------------------
// classifyPoliceUnit
// ---------------------------------------------------------------------------

test("classifyPoliceUnit: maps unit-name suffixes to a type label", () => {
  assert.equal(classifyPoliceUnit("臺北市政府警察局"), "警察局");
  assert.equal(classifyPoliceUnit("福建省連江縣警察局"), "警察局");
  assert.equal(classifyPoliceUnit("中山分局"), "分局");
  assert.equal(classifyPoliceUnit("湖口分駐所"), "分駐所");
  assert.equal(classifyPoliceUnit("中山一派出所"), "派出所");
  assert.equal(classifyPoliceUnit("嶼坪駐在所"), "駐在所");
  assert.equal(classifyPoliceUnit("北竿警察所"), "警察所");
  assert.equal(classifyPoliceUnit("清水檢查哨"), "檢查哨");
  assert.equal(classifyPoliceUnit("竹北分局竹北小隊"), "小隊");
  assert.equal(classifyPoliceUnit("某某單位"), "其他");
});

// ---------------------------------------------------------------------------
// convertPoliceCoordinates — 121°E by default, 119°E only when the address's
// county says the 121°E reading is wrong.
// ---------------------------------------------------------------------------

test("convertPoliceCoordinates: real offshore rows (extended 121°E grid) keep zone 121 and land in their county", () => {
  const cases = [
    { address: "澎湖縣馬公市治平路36號", x: 103598.2991, y: 2608149.162, county: "澎湖縣" },
    { address: "金門縣金城鎮金山路15號", x: -21575.4256, y: 2705112.582, county: "金門縣" },
    { address: "連江縣南竿鄉介壽村260號", x: 145131.6436, y: 2894404.988, county: "連江縣" },
  ];
  for (const c of cases) {
    const p = convertPoliceCoordinates(c.x, c.y, c.address);
    assert.ok(p, c.address);
    assert.equal(p.centralMeridianDeg, 121, `${c.address} is published in the 121°E grid`);
    assert.ok(isWithinCountyBounds(c.county, p.lat, p.lng), `${c.address} -> ${p.lat},${p.lng} outside ${c.county}`);
  }
});

test("convertPoliceCoordinates: coordinates genuinely in the 119°E island zone are detected by the county check", () => {
  const places = [
    { address: "澎湖縣馬公市治平路36號", lat: 23.5701, lng: 119.5659, county: "澎湖縣" },
    { address: "金門縣金城鎮金山路15號", lat: 24.4286, lng: 118.3224, county: "金門縣" },
    { address: "連江縣南竿鄉介壽村260號", lat: 26.1574, lng: 119.9511, county: "連江縣" },
  ];
  for (const place of places) {
    const { x, y } = krugerForward(place.lat, place.lng, 119);
    const p = convertPoliceCoordinates(x, y, place.address);
    assert.ok(p, place.address);
    assert.equal(p.centralMeridianDeg, 119, `${place.address} should be recognised as the 119°E zone`);
    assert.ok(Math.abs(p.lat - place.lat) < 1e-5 && Math.abs(p.lng - place.lng) < 1e-5, `${place.address}: ${p.lat},${p.lng}`);
    assert.ok(isWithinCountyBounds(place.county, p.lat, p.lng));
  }
});

test("convertPoliceCoordinates: mainland rows stay on 121°E even where the loose county box would veto them", () => {
  // 桃園市復興區 reaches 24.65°N; countyBounds' 桃園市 box starts at 24.7°N. Neither zone
  // satisfies the box, and the real point is the 121°E reading — it must not be dropped.
  const p = convertPoliceCoordinates(290337.792, 2731056.021, "桃園市復興區華陵里9鄰44號");
  assert.ok(p);
  assert.equal(p.centralMeridianDeg, 121);
  assert.ok(Math.abs(p.lat - 24.686) < 0.01 && Math.abs(p.lng - 121.399) < 0.01);
});

test("convertPoliceCoordinates: 烏坵 is 金門縣 administratively but sits at 25.0°N 119.46°E and is not rejected", () => {
  const p = convertPoliceCoordinates(94409.6891, 2765896.521, "金門縣烏坵鄉大坵村1號");
  assert.ok(p);
  assert.equal(p.centralMeridianDeg, 121);
  assert.ok(Math.abs(p.lat - 24.993) < 0.01 && Math.abs(p.lng - 119.459) < 0.01);
});

test("convertPoliceCoordinates: an address with no recognisable county defaults to 121°E", () => {
  const p = convertPoliceCoordinates(218777.003, 2671649.703, "某某路1號");
  assert.ok(p);
  assert.equal(p.centralMeridianDeg, 121);
});

test("convertPoliceCoordinates: unusable input gives null, never a wrong point", () => {
  assert.equal(convertPoliceCoordinates(NaN, 2608149, "澎湖縣馬公市治平路36號"), null);
  assert.equal(convertPoliceCoordinates(0, 0, "澎湖縣馬公市治平路36號"), null);
  assert.equal(convertPoliceCoordinates(2608149, 103598, "澎湖縣馬公市治平路36號"), null, "swapped X/Y");
});

// ---------------------------------------------------------------------------
// parsePoliceStations
// ---------------------------------------------------------------------------

test("parsePoliceStations: unzips, skips manifest.csv, and reads the release date from the CSV name", () => {
  const out = parsePoliceStations(fixtureZip());
  assert.equal(out.csvFileName, "PoliceAddress1_1150930.csv");
  assert.equal(out.dataAsOf, "2026-09-30");
  assert.equal(out.records.length, 71);
  assert.equal(out.stats.rows, 71);
  assert.equal(out.stats.withoutCoordinates, 0);
});

test("parsePoliceStations: every record is a police_station facility under source police_station_5958 with a unique sourceId", () => {
  const { records } = parsePoliceStations(fixtureZip());
  assert.equal(POLICE_STATION_FACILITY_TYPE, "police_station");
  assert.equal(POLICE_STATION_SOURCE_KEY, "police_station_5958");
  for (const r of records) {
    assert.equal(r.facilityType, "police_station");
    assert.equal(r.sourceKey, "police_station_5958");
    assert.ok(r.name && r.address, "name and address are required");
    assert.ok(r.sourceId.length <= 100);
    assert.equal(r.dataOrg, "內政部警政署");
    assert.equal(r.extra.dataAsOf, "2026-09-30");
    assert.ok(typeof r.lat === "number" && typeof r.lng === "number", `${r.name} has coordinates`);
    assert.ok(!/\s{2,}/.test(r.phone ?? ""), `${r.name}: phone whitespace collapsed`);
  }
  assert.equal(new Set(records.map((r) => r.sourceId)).size, records.length);
});

test("parsePoliceStations: stations sharing one address and coordinate (馬公分局 / 光明派出所) stay separate records", () => {
  const { records } = parsePoliceStations(fixtureZip());
  const a = records.find((r) => r.name === "馬公分局");
  const b = records.find((r) => r.name === "光明派出所");
  assert.ok(a && b);
  assert.equal(a.address, b.address);
  assert.equal(a.lat, b.lat);
  assert.notEqual(a.sourceId, b.sourceId);
  assert.equal(a.serviceItem, "分局");
  assert.equal(b.serviceItem, "派出所");
});

test("parsePoliceStations: all 澎湖 / 金門 / 連江 rows land inside their own county (the issue's live-check, done on the fixture)", () => {
  const { records, stats } = parsePoliceStations(fixtureZip());
  const byCounty = { 澎湖縣: [], 金門縣: [], 連江縣: [] };
  for (const r of records) {
    for (const county of Object.keys(byCounty)) {
      // 虎井派出所's published address is "澎湖馬公市…" (no 縣), so match on the leading two characters.
      if (r.address.startsWith(county.slice(0, 2))) byCounty[county].push(r);
    }
  }
  assert.equal(byCounty["澎湖縣"].length, 28);
  assert.equal(byCounty["金門縣"].length, 9);
  assert.equal(byCounty["連江縣"].length, 7);
  for (const [county, rows] of Object.entries(byCounty)) {
    for (const r of rows) {
      const wuqiu = r.address.startsWith("金門縣烏坵鄉");
      const ok = wuqiu
        ? r.lat > 24.9 && r.lat < 25.1 && r.lng > 119.4 && r.lng < 119.55
        : isWithinCountyBounds(county, r.lat, r.lng);
      assert.ok(ok, `${r.name} (${county}) -> ${r.lat},${r.lng}`);
    }
  }
  assert.equal(stats.coordinateZone119, 0, "the real release is entirely in the 121°E grid");
});

test("parsePoliceStations: three named samples (澎湖縣政府警察局 / 金門縣警察局 / 福建省連江縣警察局) match their towns", () => {
  const { records } = parsePoliceStations(fixtureZip());
  const get = (name) => records.find((r) => r.name === name);
  const penghu = get("澎湖縣政府警察局");
  const kinmen = get("金門縣警察局");
  const lienchiang = get("福建省連江縣警察局");
  assert.ok(Math.abs(penghu.lat - 23.57) < 0.01 && Math.abs(penghu.lng - 119.566) < 0.01);
  assert.ok(Math.abs(kinmen.lat - 24.4286) < 0.01 && Math.abs(kinmen.lng - 118.3224) < 0.01);
  assert.ok(Math.abs(lienchiang.lat - 26.157) < 0.01 && Math.abs(lienchiang.lng - 119.951) < 0.01);
});

test("parsePoliceStations: keeps the publisher's address text (including the 3 rows without a county prefix)", () => {
  const { records } = parsePoliceStations(fixtureZip());
  assert.equal(records.find((r) => r.name === "虎井派出所").address, "澎湖馬公市虎井里9鄰75-2號");
  assert.equal(records.find((r) => r.name === "豐里派出所").address, "臺東市中華路3段415號");
  assert.equal(records.find((r) => r.name === "枋寮分局").address, "枋寮鄉枋寮村儲運路2-37號之2");
});

test("parsePoliceStations: 豐丘派出所 (real release defect: POINT_Y is a copy of POINT_X) borrows the coordinates of the same-address 信義 rows", () => {
  const { records, stats } = parsePoliceStations(fixtureZip());
  const defect = records.find((r) => r.name === "豐丘派出所");
  // The first same-address row that has usable coordinates is the donor (信義分局 precedes 信義派出所 in the file).
  const donor = records.find((r) => r.name === "信義分局" && r.address === defect.address);
  assert.ok(defect && donor);
  assert.equal(defect.lat, donor.lat);
  assert.equal(defect.lng, donor.lng);
  assert.ok(defect.lat > 23.4 && defect.lat < 23.8 && defect.lng > 120.8 && defect.lng < 121.2, "inside 南投縣信義鄉, not at the bogus Y=235144");
  assert.equal(defect.extra.coordinateBorrowedFrom, donor.name);
  assert.equal(stats.coordinatesBorrowedFromSameAddress, 1);
  assert.equal(donor.extra.coordinateBorrowedFrom, undefined, "only the defective row is marked");
});

test("parsePoliceStations: extra carries the unit type, English name, postal code and coordinate zone", () => {
  const { records } = parsePoliceStations(fixtureZip());
  const r = records.find((rec) => rec.name === "中山一派出所");
  assert.equal(r.extra.unitType, "派出所");
  assert.equal(r.extra.englishName, "Zhongshan First Police Station");
  assert.equal(r.extra.postalCode, "104");
  assert.equal(r.extra.coordinateZone, 121);
  assert.equal(r.phone, "02 25519321");
});

test("parsePoliceStations: a row without usable coordinates is kept (address still useful) with null lat/lng and counted", () => {
  const csv = [
    "﻿中文單位名稱,英文單位名稱,郵遞區號,地址,電話,POINT_X,POINT_Y",
    "壞座標派出所,Bad,100,臺北市中正區某路1號,02 11111111,abc,2770733",
    "好派出所,Good,100,臺北市中正區某路2號,02 22222222,301442.6468,2770733.688",
  ].join("\n");
  const out = parsePoliceStations(buildZip([["PoliceAddress1_1150930.csv", csv]]));
  assert.equal(out.records.length, 2);
  assert.equal(out.records[0].lat, null);
  assert.equal(out.records[0].lng, null);
  assert.equal(out.stats.withoutCoordinates, 1);
  assert.ok(out.records[1].lat > 25);
});

test("parsePoliceStations: rows missing a name or address are dropped and counted; exact duplicates collapse", () => {
  const csv = [
    "﻿中文單位名稱,英文單位名稱,郵遞區號,地址,電話,POINT_X,POINT_Y",
    ",NoName,100,臺北市中正區某路1號,02 1,301442.6468,2770733.688",
    "無地址派出所,NoAddr,100,,02 2,301442.6468,2770733.688",
    "重複派出所,Dup,100,臺北市中正區某路3號,02 3,301442.6468,2770733.688",
    "重複派出所,Dup,100,臺北市中正區某路3號,02 3,301442.6468,2770733.688",
  ].join("\n");
  const out = parsePoliceStations(buildZip([["PoliceAddress1_1150930.csv", csv]]));
  assert.equal(out.records.length, 1);
  assert.equal(out.stats.rows, 4);
  assert.equal(out.stats.skippedMissingIdentity, 2);
  assert.equal(out.stats.duplicateRows, 1);
});

test("parsePoliceStations: a response that is not a ZIP (e.g. the 403 HTML page) fails loudly and says so", () => {
  const html = Buffer.from("<html><head><title>403 Forbidden</title></head></html>", "utf8");
  assert.throws(() => parsePoliceStations(html), /ZIP/);
  assert.throws(() => parsePoliceStations(Buffer.alloc(0)), /ZIP/);
});

test("parsePoliceStations: a ZIP with only manifest.csv fails loudly", () => {
  assert.throws(() => parsePoliceStations(buildZip([["manifest.csv", MANIFEST]])), /CSV/);
});

test("parsePoliceStations: a renamed critical column fails schema validation instead of importing garbage", () => {
  const csv = ["﻿中文單位名稱,英文單位名稱,郵遞區號,地址,電話,X,Y", "甲派出所,A,100,臺北市中正區某路1號,02 1,301442,2770733"].join("\n");
  assert.throws(() => parsePoliceStations(buildZip([["PoliceAddress1_1150930.csv", csv]])), /schema validation failed/);
});

// ---------------------------------------------------------------------------
// assertPoliceSnapshotSane — the import's guard before it deletes the old snapshot.
// ---------------------------------------------------------------------------

function fakeParsed(count, withoutCoordinates = 0) {
  return {
    records: Array.from({ length: count }, (_, i) => ({ sourceId: String(i) })),
    stats: { rows: count, withoutCoordinates },
  };
}

test("assertPoliceSnapshotSane: accepts a full-size snapshot", () => {
  assert.doesNotThrow(() => assertPoliceSnapshotSane(fakeParsed(1687)));
  assert.equal(POLICE_STATION_MIN_ROWS, 1000);
});

test("assertPoliceSnapshotSane: refuses a truncated snapshot", () => {
  assert.throws(() => assertPoliceSnapshotSane(fakeParsed(POLICE_STATION_MIN_ROWS - 1)), /1000/);
});

test("assertPoliceSnapshotSane: refuses a snapshot whose coordinate conversion mostly failed (projection change)", () => {
  assert.throws(() => assertPoliceSnapshotSane(fakeParsed(1687, 400)), /coordinates/);
  assert.doesNotThrow(() => assertPoliceSnapshotSane(fakeParsed(1687, 5)));
});
