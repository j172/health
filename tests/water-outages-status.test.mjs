import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

const { taipeiWallClockToUtcIso, utcMsToTaipeiSql, deriveOutageStatus } = await import(
  "../lib/server/waterOutages/outageTime.ts"
);

// Live 2026-10-14: /tools/water-outages listed 1,692 "active" outages, 1,643
// of which had already ended (back to mid-September) — status was set once
// at ingestion and never revisited — and every time shown was 8 hours late.

test("a mysql2 Date carrying Taipei wall-clock digits is shifted to the real UTC instant", () => {
  // DB value "2026-10-14 09:17:00" (Taipei), read with timezone "Z".
  const fromDb = new Date("2026-10-14T09:17:00.000Z");
  assert.equal(taipeiWallClockToUtcIso(fromDb), "2026-10-14T01:17:00.000Z");
  assert.equal(taipeiWallClockToUtcIso("2026-10-14 09:17:00"), "2026-10-14T01:17:00.000Z");
});

test("utcMsToTaipeiSql is the inverse used for the end_time cutoff", () => {
  assert.equal(utcMsToTaipeiSql(Date.parse("2026-10-14T01:17:00.000Z")), "2026-10-14 09:17:00");
});

test("status is re-derived from the times, not trusted from the row", () => {
  const now = Date.parse("2026-10-14T01:30:00.000Z");
  assert.equal(deriveOutageStatus("2026-09-17T06:00:00.000Z", "2026-09-17T10:00:00.000Z", now), "resolved");
  assert.equal(deriveOutageStatus("2026-10-14T01:17:00.000Z", "2026-10-14T03:30:00.000Z", now), "active");
  assert.equal(deriveOutageStatus("2026-10-15T01:00:00.000Z", "2026-10-15T09:00:00.000Z", now), "scheduled");
});

test("the overview query only loads recent cases and never swaps an empty result for seed data", () => {
  const src = fs.readFileSync(new URL("lib/server/waterOutages/queries.ts", REPO_ROOT), "utf8");
  assert.match(src, /WHERE end_time >= \?/);
  assert.match(src, /status: deriveOutageStatus\(startTime, endTime, nowMs\)/);
  assert.doesNotMatch(src, /if \(rows\.length === 0\) \{\s*return getMemorySeedOverview/);
});
