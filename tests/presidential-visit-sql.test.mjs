import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Live 2026-10-14 culture-sync result: presidential failed with "You have an
// error in your SQL syntax ... near '01:25:34, 2026-10-14 01:25:34'".
// utcNowSql() returns a plain datetime string meant to be bound as a
// parameter; it was interpolated into the SQL text unquoted.

test("ingestPresidentialVisit binds timestamps instead of interpolating them", () => {
  const src = fs.readFileSync(new URL("../lib/server/culture/ingestPresidentialVisit.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\$\{utcNowSql\(\)\}/);
  assert.match(src, /const now = utcNowSql\(\);/);
});
