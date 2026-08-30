import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = new URL("../../../", import.meta.url);
const ROOT_DIR = fileURLToPath(REPO_ROOT);

test("data/cdc-travel-alert.csv exists and contains valid columns and verified current alerts", () => {
  const filePath = path.join(ROOT_DIR, "data", "cdc-travel-alert.csv");
  assert.ok(existsSync(filePath), `Missing ${filePath}`);

  const content = readFileSync(filePath, "utf-8");
  assert.ok(content.length > 1000, "data/cdc-travel-alert.csv should not be empty");

  const lines = content.split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length > 50, `Expected > 50 alerts, got ${lines.length}`);

  const header = lines[0];
  assert.ok(
    header.includes("alert_disease") || header.includes("疾病名稱") || header.includes("disease"),
    "Header must contain disease column"
  );
  assert.ok(
    header.includes("areaDesc") || header.includes("國家/地區") || header.includes("country"),
    "Header must contain country/area column"
  );
  assert.ok(
    header.includes("severity_level") || header.includes("警示等級") || header.includes("alert_level"),
    "Header must contain severity level column"
  );

  // Check for common infectious diseases in alerts
  assert.ok(content.includes("登革熱"), "Should contain 登革熱 alerts");
  assert.ok(content.includes("麻疹"), "Should contain 麻疹 alerts");
  assert.ok(content.includes("屈公病"), "Should contain 屈公病 alerts");
  assert.ok(content.includes("M痘") || content.includes("猴痘"), "Should contain 猴痘/M痘 alerts");
  assert.ok(content.includes("霍亂"), "Should contain 霍亂 alerts");
});

test("data/cdc-intl-epid.csv exists and contains valid epidemic news items", () => {
  const filePath = path.join(ROOT_DIR, "data", "cdc-intl-epid.csv");
  assert.ok(existsSync(filePath), `Missing ${filePath}`);

  const content = readFileSync(filePath, "utf-8");
  assert.ok(content.length > 1000, "data/cdc-intl-epid.csv should not be empty");

  const lines = content.split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length > 50, `Expected > 50 news items, got ${lines.length}`);

  const header = lines[0];
  assert.ok(
    header.includes("headline") || header.includes("標題") || header.includes("title"),
    "Header must contain headline column"
  );
  assert.ok(
    header.includes("description") || header.includes("內容") || header.includes("說明"),
    "Header must contain description column"
  );
});
