import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Live 2026-10-14: /tools/er-status crashed with React error #31 ("Objects
// are not valid as a React child", args: [object Date]). The mysql pool runs
// with dateStrings: false, so reported_at arrived as a Date object despite
// its `string` type, and the card rendered it directly.

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("ER queries normalise every DATETIME field to an ISO string", () => {
  const src = read("lib/server/emergencyRooms/queries.ts");
  assert.match(src, /value instanceof Date \? value\.toISOString\(\)/);
  assert.doesNotMatch(src, /reported_at: r\.reported_at,/);
  assert.doesNotMatch(src, /updated_at: r\.updated_at,/);
  assert.doesNotMatch(src, /updatedAt: stats\.latest_report \|\|/);
});

test("the ER card formats reported_at instead of rendering the raw value", () => {
  const src = read("components/Tools/EmergencyRoomContent.tsx");
  assert.doesNotMatch(src, /\{hospital\.reported_at\}/);
  assert.match(src, /formatReportedAt\(hospital\.reported_at\)/);
  assert.match(src, /timeZone: "Asia\/Taipei"/);
});
