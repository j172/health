import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

// Ensure dummy test database environment variables so mysql module loads offline
process.env.NEXT_PHASE = "phase-production-build";
process.env.MYSQL_HOST ??= "127.0.0.1";
process.env.MYSQL_PORT ??= "3307";
process.env.MYSQL_USER ??= "test_user";
process.env.MYSQL_PASSWORD ??= "test_pass";
process.env.MYSQL_DATABASE ??= "test_db";
process.env.RSS_SYNC_ADMIN_SECRET ??= "test_secret";

const REPO_ROOT = new URL("../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    if (context.parentURL && context.parentURL.includes("node_modules")) {
      return nextResolve(specifier, context);
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
    }
    if (!specifier.startsWith(".") && !specifier.startsWith("@/") && !specifier.startsWith("node:")) {
      try {
        return nextResolve(specifier, {
          ...context,
          parentURL: "file:///D:/GoogleDrive/health/package.json",
        });
      } catch {
        // Fall back to default
      }
    }
    return nextResolve(target, context);
  },
});

const { getPlaActivitiesSeed, getPlaActivities, getPlaActivityByDate } = await import("./queries.ts");

test("getPlaActivitiesSeed loads 30 authentic seed items sorted newest first", () => {
  const seed = getPlaActivitiesSeed();
  assert.ok(Array.isArray(seed));
  assert.ok(seed.length >= 30, `Expected at least 30 seed items, got ${seed.length}`);

  // Check ordering: newest date first
  for (let i = 0; i < seed.length - 1; i++) {
    assert.ok(
      seed[i].activityDate >= seed[i + 1].activityDate,
      `Expected ${seed[i].activityDate} >= ${seed[i + 1].activityDate}`
    );
  }

  // Check structure of first item
  const first = seed[0];
  assert.equal(typeof first.activityDate, "string");
  assert.match(first.activityDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof first.aircraftTotal, "number");
  assert.equal(typeof first.aircraftCrossed, "number");
  assert.equal(typeof first.vesselsTotal, "number");
  assert.equal(typeof first.officialShipsTotal, "number");
  assert.equal(typeof first.description, "string");
  assert.ok(first.description.length > 10);
  assert.ok(first.sourceUrl.startsWith("http"));
});

test("getPlaActivities returns items respecting limit and fallback", async () => {
  const items = await getPlaActivities(10);
  assert.ok(Array.isArray(items));
  assert.ok(items.length <= 10);
  assert.ok(items.length > 0);
  assert.equal(typeof items[0].aircraftTotal, "number");
});

test("getPlaActivityByDate finds matching date or returns null", async () => {
  const seed = getPlaActivitiesSeed();
  assert.ok(seed.length > 0);
  const targetDate = seed[0].activityDate;

  const found = await getPlaActivityByDate(targetDate);
  assert.ok(found !== null);
  assert.equal(found.activityDate, targetDate);

  const missing = await getPlaActivityByDate("1900-01-01");
  assert.equal(missing, null);
});
