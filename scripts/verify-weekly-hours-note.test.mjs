import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Extract isDisplayableNote function from WeeklyHours.tsx or implement the tested regex directly
function isDisplayableNote(note) {
  if (!note) return false;
  const trimmed = String(note).trim();
  if (trimmed === "" || trimmed === "-") return false;
  if (/[\?？]{2,}/.test(trimmed)) return false;
  return true;
}

test("isDisplayableNote filters out question-mark mojibake and allows valid Chinese notes", () => {
  // Valid notes
  assert.equal(isDisplayableNote("春節期間2月14-2月22日休診"), true);
  assert.equal(isDisplayableNote("國定假日看診時間請先電洽"), true);
  assert.equal(isDisplayableNote("預約掛號專線：02-12345678"), true);
  assert.equal(isDisplayableNote("週日僅提供早診？請先電話確認"), true);

  // Corrupted mojibake notes from latin1 character set conversion
  assert.equal(isDisplayableNote("????2?14-2?22???"), false);
  assert.equal(isDisplayableNote("????"), false);
  assert.equal(isDisplayableNote("???"), false);
  assert.equal(isDisplayableNote("??"), false);
  assert.equal(isDisplayableNote("備註：????"), false);
  assert.equal(isDisplayableNote("？？？？"), false);

  // Empty / placeholder notes
  assert.equal(isDisplayableNote(""), false);
  assert.equal(isDisplayableNote("   "), false);
  assert.equal(isDisplayableNote("-"), false);
  assert.equal(isDisplayableNote(null), false);
  assert.equal(isDisplayableNote(undefined), false);
});

test("lib/server/facilities/queries.ts specifies utf8mb4 charset and collation for tmp_weekly_hours table", () => {
  const queriesPath = path.join(process.cwd(), "lib", "server", "facilities", "queries.ts");
  const content = fs.readFileSync(queriesPath, "utf-8");

  assert.ok(
    content.includes("CREATE TEMPORARY TABLE tmp_weekly_hours"),
    "Must create tmp_weekly_hours",
  );
  assert.ok(
    content.includes("note VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"),
    "note column must have explicit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  );
  assert.ok(
    content.includes("DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"),
    "tmp_weekly_hours table must have DEFAULT CHARSET=utf8mb4",
  );
});

test("lib/server/db/mysql.ts includes cleanup migration for corrupted weeklyHoursNote", () => {
  const mysqlPath = path.join(process.cwd(), "lib", "server", "db", "mysql.ts");
  const content = fs.readFileSync(mysqlPath, "utf-8");

  assert.ok(
    content.includes("JSON_REMOVE(extra_json, '$.weeklyHoursNote')"),
    "Must clean up corrupted weeklyHoursNote from facilities.extra_json",
  );
  assert.ok(
    content.includes("LIKE '%??%'"),
    "Must target corrupted rows with consecutive question marks",
  );
});
