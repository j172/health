import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  minguoToIsoDate,
  computeStatus,
  parseCsv,
  cleanCsvText,
} from "./import-nhi-penalties.mjs";

test("minguoToIsoDate correctly converts ROC date strings to ISO YYYY-MM-DD", () => {
  assert.equal(minguoToIsoDate("1150801"), "2026-08-01");
  assert.equal(minguoToIsoDate("1160731"), "2027-07-31");
  assert.equal(minguoToIsoDate("1110601"), "2022-06-01");
  assert.equal(minguoToIsoDate("990501"), "2010-05-01");
  assert.equal(minguoToIsoDate(""), null);
  assert.equal(minguoToIsoDate(null), null);
  assert.equal(minguoToIsoDate("暫緩執行"), null);
  assert.equal(minguoToIsoDate("invalid"), null);
});

test("computeStatus evaluates active, suspended_execution, and expired accurately", () => {
  // Suspended execution always returns suspended_execution
  assert.equal(computeStatus("2026-08-01", "2026-10-31", true), "suspended_execution");

  // Past date returns expired
  assert.equal(computeStatus("2020-01-01", "2020-12-31", false), "expired");

  // Future date returns active
  assert.equal(computeStatus("2026-08-01", "2030-12-31", false), "active");

  // No end date returns active
  assert.equal(computeStatus("2026-08-01", null, false), "active");
});

test("parseCsv & cleanCsvText handles headers with quotes, newlines and title rows", () => {
  const sampleDl75736 = `全民健康保險特約醫事服務機構違規情節重大名冊(1150828更新),,,,,,,,,
序號,縣市地區,院所代號,院所名稱,"負責醫事人員
/行為人",處分類別,處分原由,處分條款,執行起日,執行迄日
1,嘉義市西區,3522023877,博愛診所,王博瀚,終止特約,"經查長期未經看診虛報費用超過25萬點",全民健康保險法第81條,1140901,1150831`;

  const cleaned = cleanCsvText(sampleDl75736);
  const rows = parseCsv(cleaned);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["院所代號"], "3522023877");
  assert.equal(rows[0]["院所名稱"], "博愛診所");
  assert.equal(rows[0]["處分類別"], "終止特約");
  assert.equal(rows[0]["負責醫事人員行為人"], "王博瀚");
});

test("clinics config in facilityConfigs.ts includes '違規／停約' category filter and updated description", () => {
  const configPath = path.join(process.cwd(), "app", "tools", "facilityConfigs.ts");
  const content = fs.readFileSync(configPath, "utf-8");

  assert.ok(content.includes('value: "違規／停約"'), "Should contain 違規／停約 category value");
  assert.ok(content.includes('label: "⚠️ 違規／停約名單"'), "Should contain ⚠️ 違規／停約名單 label");
  assert.ok(content.includes("健保違規重大、停約及五年不予特約名冊"), "Description should mention penalties");
});

test("nhi-penalties seed JSON exists and contains expected record structure", () => {
  const seedPath = path.join(process.cwd(), "data", "facilities-seeds", "nhi-penalties.json");
  assert.ok(fs.existsSync(seedPath), "Seed file must exist");

  const records = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
  assert.ok(Array.isArray(records));
  assert.ok(records.length > 50, "Expected > 50 penalties records");

  const addressRecord = records.find((r) => r.sourceId.startsWith("addr_"));
  assert.ok(addressRecord, "Should contain address-only records");
  assert.equal(addressRecord.serviceItem, "五年不予特約地址");
  assert.ok(addressRecord.name.startsWith("[健保管制地址]"));
  assert.ok(addressRecord.extra?.penalty);
  assert.ok(["active", "suspended_execution", "expired"].includes(addressRecord.extra.penalty.status));

  const clinicRecord = records.find((r) => !r.sourceId.startsWith("addr_"));
  assert.ok(clinicRecord, "Should contain clinic penalty records");
  assert.equal(clinicRecord.facilityType, "clinic");
  assert.ok(clinicRecord.extra?.penalty?.category);
});
