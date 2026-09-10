import test from "node:test";
import assert from "node:assert/strict";
import { cleanAddressForTgos, formatTgosCsv } from "./export-facilities-for-tgos.mjs";
import {
  parseCsvRows,
  parseTgosResultCsv,
  isWithinTaiwanBounds,
  twd97ToWgs84,
} from "./import-tgos-geocode-results.mjs";

test("TGOS Export: cleanAddressForTgos strips unwanted whitespace and quotes", () => {
  assert.equal(cleanAddressForTgos('  "台北市中正區\r\n忠孝東路一段1號"  '), "台北市中正區 忠孝東路一段1號");
  assert.equal(cleanAddressForTgos(null), "");
  assert.equal(cleanAddressForTgos(""), "");
});

test("TGOS Export: formatTgosCsv generates valid CSV with UTF-8 BOM", () => {
  const sampleRows = [
    { id: 101, address: "台北市中正區忠孝東路一段1號" },
    { id: 102, address: "新北市板橋區縣民大道二段7號, 1樓" },
  ];

  const csv = formatTgosCsv(sampleRows);
  assert.ok(csv.startsWith("\uFEFF"), "Should start with UTF-8 BOM");
  assert.ok(csv.includes("id,Address"), "Should contain header");
  assert.ok(csv.includes("101,台北市中正區忠孝東路一段1號"));
  assert.ok(csv.includes('102,"新北市板橋區縣民大道二段7號, 1樓"'), "Should quote comma-separated address");
});

test("TGOS Import: parseCsvRows handles quotes and line breaks", () => {
  const raw = 'id,Address\r\n101,"台北市, 中正區"\r\n102,新北市板橋區';
  const rows = parseCsvRows(raw);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ["id", "Address"]);
  assert.deepEqual(rows[1], ["101", "台北市, 中正區"]);
  assert.deepEqual(rows[2], ["102", "新北市板橋區"]);
});

test("TGOS Import: twd97ToWgs84 converts Taiwan TM2 coordinates accurately", () => {
  // Taipei 101 coordinates
  const x = 306976;
  const y = 2769609;
  const wgs = twd97ToWgs84(x, y);

  assert.ok(wgs.lat >= 25.033 && wgs.lat <= 25.035, `Latitude ${wgs.lat} expected near 25.034`);
  assert.ok(wgs.lng >= 121.563 && wgs.lng <= 121.566, `Longitude ${wgs.lng} expected near 121.564`);
});

test("TGOS Import: isWithinTaiwanBounds validates Taiwan bounds strictly", () => {
  assert.ok(isWithinTaiwanBounds(25.0339, 121.5645), "Taipei should be inside");
  assert.ok(isWithinTaiwanBounds(22.6273, 120.3014), "Kaohsiung should be inside");
  assert.ok(isWithinTaiwanBounds(24.4327, 118.3766), "Kinmen should be inside");

  assert.ok(!isWithinTaiwanBounds(35.6762, 139.6503), "Tokyo should be outside");
  assert.ok(!isWithinTaiwanBounds(0, 0), "Null island should be outside");
  assert.ok(!isWithinTaiwanBounds(NaN, 121.5), "NaN should be invalid");
});

test("TGOS Import: parseTgosResultCsv parses WGS84 and TWD97 results", () => {
  const sampleWgs84Csv = `\uFEFFid,Address,Response_Address,Response_X,Response_Y
1,台北市中正區重慶南路一段122號,臺北市中正區重慶南路一段122號,121.511942,25.040082
2,無效地址,查無門牌,0,0
3,新北市板橋區縣民大道二段7號,新北市板橋區縣民大道二段7號,121.462788,25.013588
`;

  const parsed = parseTgosResultCsv(sampleWgs84Csv);
  assert.equal(parsed.length, 2, "Should parse 2 valid items (ignoring 0,0)");
  assert.equal(parsed[0].id, 1);
  assert.equal(parsed[0].lng, 121.511942);
  assert.equal(parsed[0].lat, 25.040082);
  assert.equal(parsed[0].responseAddress, "臺北市中正區重慶南路一段122號");

  assert.equal(parsed[1].id, 3);
  assert.equal(parsed[1].lng, 121.462788);
  assert.equal(parsed[1].lat, 25.013588);
});

test("TGOS Import: parseTgosResultCsv handles localized column headers and TWD97 auto-conversion", () => {
  const sampleTwd97Csv = `序號,原始地址,比對門牌地址,X,Y
55,台北市信義區市府路1號,臺北市信義區市府路1號,306976,2769609
`;

  const parsed = parseTgosResultCsv(sampleTwd97Csv);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 55);
  // Auto converted from TWD97 to WGS84
  assert.ok(parsed[0].lat >= 25.033 && parsed[0].lat <= 25.035);
  assert.ok(parsed[0].lng >= 121.563 && parsed[0].lng <= 121.566);
});
