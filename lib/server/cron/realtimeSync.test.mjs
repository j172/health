import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = new URL("../../../", import.meta.url);
const ROOT_DIR = fileURLToPath(REPO_ROOT);

test("data/pest-alerts-seed.json exists and contains valid MOA Crop Pest warnings", () => {
  const seedPath = path.join(ROOT_DIR, "data", "pest-alerts-seed.json");
  assert.ok(existsSync(seedPath), `Missing ${seedPath}`);

  const raw = readFileSync(seedPath, "utf-8");
  const alerts = JSON.parse(raw);
  assert.ok(Array.isArray(alerts), "Expected array of pest alerts");
  assert.ok(alerts.length >= 10, `Expected >= 10 pest alerts, got ${alerts.length}`);

  const sample = alerts[0];
  assert.ok(sample.subjectName, "Missing subjectName");
  assert.ok(sample.monitorType, "Missing monitorType");
  assert.ok(sample.alertTime, "Missing alertTime");
  assert.ok(sample.targetCrops, "Missing targetCrops");
  assert.ok(sample.warningLevel, "Missing warningLevel");
});

test("data/latest-books-seed.json contains TAAZE category books", () => {
  const seedPath = path.join(ROOT_DIR, "data", "latest-books-seed.json");
  assert.ok(existsSync(seedPath), `Missing ${seedPath}`);

  const raw = readFileSync(seedPath, "utf-8");
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.books), "Expected books array in latest-books-seed");

  const taazeBooks = data.books.filter((b) => b.platform === "taaze");
  assert.ok(taazeBooks.length > 0, "Expected TAAZE books to be present in seed");
});
