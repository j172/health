import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const {
  parsePowerOutagesXml,
  splitAdminArea,
  normalizeTimestamp,
  parseCoordinateString,
  aggregateOutageData,
} = await import("../lib/server/power/outageParser.ts");

const MOCK_TAIPOWER_KML = `<?xml version="1.0" encoding="utf-8" ?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document id="root_doc">
<Folder><name>d006012</name>
  <Placemark>
    <行政區>嘉義縣朴子市</行政區>
    <停電區域>竹村里</停電區域>
    <影響戶數>217</影響戶數>
    <預計修復時間>2026/10/23 下午 05:00:00</預計修復時間>
    <聯絡人_x0028_電話一_x0029_>1911</聯絡人_x0028_電話一_x0029_>
    <資料更新時間>2026/10/23 15:30:00</資料更新時間>
    <Polygon>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>
            120.2451,23.4561,0 120.2462,23.4572,0 120.2473,23.4583,0 120.2451,23.4561,0
          </coordinates>
        </LinearRing>
      </outerBoundaryIs>
    </Polygon>
  </Placemark>
  <Placemark>
    <行政區>臺北市北投區</行政區>
    <停電區域>大屯里</停電區域>
    <影響戶數>85</影響戶數>
    <預計修復時間>115/10/23 18:30:00</預計修復時間>
    <聯絡人_x0028_電話一_x0029_>1911</聯絡人_x0028_電話一_x0029_>
    <資料更新時間>2026/10/23 16:00:00</資料更新時間>
    <Polygon>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>
            121.5123,25.1432,0 121.5134,25.1443,0 121.5145,25.1454,0 121.5123,25.1432,0
          </coordinates>
        </LinearRing>
      </outerBoundaryIs>
    </Polygon>
  </Placemark>
  <Placemark>
    <行政區>嘉義縣太保市</行政區>
    <停電區域>麻寮里</停電區域>
    <影響戶數>130</影響戶數>
    <預計修復時間>查修中</預計修復時間>
    <聯絡人_x0028_電話一_x0029_>1911</聯絡人_x0028_電話一_x0029_>
    <資料更新時間>2026/10/23 16:15:00</資料更新時間>
    <Polygon>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>
            120.3210,23.5120,0 120.3220,23.5130,0 120.3230,23.5140,0 120.3210,23.5120,0
          </coordinates>
        </LinearRing>
      </outerBoundaryIs>
    </Polygon>
  </Placemark>
</Folder>
</Document>
</kml>`;

test("parsePowerOutagesXml correctly parses mock KML Placemarks and aggregates metrics", () => {
  const result = parsePowerOutagesXml(MOCK_TAIPOWER_KML);

  // Check incidents count
  assert.equal(result.incidents.length, 3);
  assert.equal(result.affectedVillagesCount, 3);
  assert.equal(result.totalOutageCount, 217 + 85 + 130); // 432

  // Check incident 0 (嘉義縣朴子市 竹村里)
  const inc0 = result.incidents[0];
  assert.equal(inc0.county, "嘉義縣");
  assert.equal(inc0.township, "朴子市");
  assert.equal(inc0.village, "竹村里");
  assert.equal(inc0.outageCount, 217);
  assert.equal(inc0.restoreTime, "2026/10/23 17:00:00");
  assert.equal(inc0.contactPhone, "1911");
  assert.equal(inc0.coordinates.length, 4);
  assert.deepEqual(inc0.coordinates[0], [120.2451, 23.4561]);

  // Check incident 1 (臺北市北投區 大屯里 with ROC timestamp)
  const inc1 = result.incidents[1];
  assert.equal(inc1.county, "臺北市");
  assert.equal(inc1.township, "北投區");
  assert.equal(inc1.village, "大屯里");
  assert.equal(inc1.outageCount, 85);
  assert.equal(inc1.restoreTime, "2026/10/23 18:30:00");
  assert.equal(inc1.coordinates.length, 4);
  assert.deepEqual(inc1.coordinates[0], [121.5123, 25.1432]);

  // Check incident 2 (嘉義縣太保市 麻寮里 with unconfirmed restore time)
  const inc2 = result.incidents[2];
  assert.equal(inc2.county, "嘉義縣");
  assert.equal(inc2.township, "太保市");
  assert.equal(inc2.village, "麻寮里");
  assert.equal(inc2.outageCount, 130);
  assert.equal(inc2.restoreTime, null);

  // Check county summaries
  assert.equal(result.countySummaries.length, 2);
  // 嘉義縣 has 217 + 130 = 347 outages across 2 villages
  assert.equal(result.countySummaries[0].county, "嘉義縣");
  assert.equal(result.countySummaries[0].outageCount, 347);
  assert.equal(result.countySummaries[0].villageCount, 2);
  assert.equal(result.countySummaries[0].count, 2);

  // 臺北市 has 85 outages across 1 village
  assert.equal(result.countySummaries[1].county, "臺北市");
  assert.equal(result.countySummaries[1].outageCount, 85);
  assert.equal(result.countySummaries[1].villageCount, 1);
  assert.equal(result.countySummaries[1].count, 1);
});

test("parsePowerOutagesXml returns safe empty fallback for empty or invalid XML", () => {
  const emptyRes = parsePowerOutagesXml("");
  assert.equal(emptyRes.totalOutageCount, 0);
  assert.equal(emptyRes.affectedVillagesCount, 0);
  assert.deepEqual(emptyRes.countySummaries, []);
  assert.deepEqual(emptyRes.incidents, []);

  const nullRes = parsePowerOutagesXml(null);
  assert.equal(nullRes.totalOutageCount, 0);
  assert.deepEqual(nullRes.incidents, []);

  const noPlacemarksXml = `<kml><Document><name>empty</name></Document></kml>`;
  const noPlacemarksRes = parsePowerOutagesXml(noPlacemarksXml);
  assert.equal(noPlacemarksRes.totalOutageCount, 0);
  assert.deepEqual(noPlacemarksRes.incidents, []);
});

test("splitAdminArea correctly parses Taiwanese county and township", () => {
  assert.deepEqual(splitAdminArea("嘉義縣朴子市"), { county: "嘉義縣", township: "朴子市" });
  assert.deepEqual(splitAdminArea("臺北市北投區"), { county: "臺北市", township: "北投區" });
  assert.deepEqual(splitAdminArea("台中市西屯區"), { county: "臺中市", township: "西屯區" });
  assert.deepEqual(splitAdminArea("新竹市東區"), { county: "新竹市", township: "東區" });
  assert.deepEqual(splitAdminArea("花蓮縣花蓮市"), { county: "花蓮縣", township: "花蓮市" });
  assert.deepEqual(splitAdminArea("金門縣金城鎮"), { county: "金門縣", township: "金城鎮" });
});

test("normalizeTimestamp correctly parses Western, ROC, and empty formats", () => {
  // Western with PM
  assert.equal(normalizeTimestamp("2026/10/23 下午 05:00:00"), "2026/10/23 17:00:00");
  assert.equal(normalizeTimestamp("2026/10/23 上午 09:30:00"), "2026/10/23 09:30:00");
  // Western 24h
  assert.equal(normalizeTimestamp("2026-10-23 17:00:00"), "2026/10/23 17:00:00");
  // ROC years (115 -> 2026)
  assert.equal(normalizeTimestamp("115/10/23 18:30:00"), "2026/10/23 18:30:00");
  assert.equal(normalizeTimestamp("115/10/23 下午 02:15:00"), "2026/10/23 14:15:00");
  assert.equal(normalizeTimestamp("115年10月23日 14時30分"), "2026/10/23 14:30:00");
  // Null and pending states
  assert.equal(normalizeTimestamp("查修中"), null);
  assert.equal(normalizeTimestamp("未定"), null);
  assert.equal(normalizeTimestamp(""), null);
  assert.equal(normalizeTimestamp(null), null);
});

test("parseCoordinateString extracts [lng, lat] tuples accurately", () => {
  const coordStr = "120.123,23.456,0 120.789,23.890,0\n120.999,24.111,0";
  const coords = parseCoordinateString(coordStr);
  assert.equal(coords.length, 3);
  assert.deepEqual(coords[0], [120.123, 23.456]);
  assert.deepEqual(coords[1], [120.789, 23.890]);
  assert.deepEqual(coords[2], [120.999, 24.111]);
});
