import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  collisionKey,
  expandCronField,
  extractCronSchedules,
  findCronCollisions,
  parseCronExpression,
  sharedTickMinutes,
  unusedMinutes,
} from "./cronCollisions.mjs";

// issue #669 (B-0), docs/2.0/track-b-opendata-phase2-3-spec.md §4 item 3 and §5
// last row: registerJobs.ts must not grow a new job that fires in the same
// tick as an existing one. Several independent PRs each add a job by reading
// a different snapshot of the file, so "pick a free minute" by eye has failed
// before (see the comment on the `30 4 * * *` pair below).

const registerJobsSource = readFileSync(new URL("./registerJobs.ts", import.meta.url), "utf8");

/**
 * Documented, deliberate exception named by spec §4 item 3: green-products
 * and wra-catalog were both scheduled at 04:30 daily. Left as-is on purpose
 * (moving a job is a separate change); the lint records it instead of
 * pretending the file is clean.
 */
const KNOWN_EXCEPTIONS = ["green-products-cron.log <> wra-catalog-sync-cron.log"];

/**
 * Same-tick pairs that already existed when this lint was introduced
 * (2026-10-15). They are a frozen baseline, NOT a list to extend: almost all
 * are an hourly or every-10-minute grid job (news-card-images
 * and power-sync `*\/10`, ...) that inevitably shares a
 * minute with a daily job at the same minute. A new job must pick a minute
 * from the failure message's "unused minutes" list instead of adding here.
 * Removing a job or moving it off a shared minute lets you delete its entries.
 */
const LEGACY_BASELINE_COLLISIONS = [
  "aqi-sync-cron.log <> carbon-footprint-coefficients-cron.log",
  "aqi-sync-cron.log <> news-card-images-cron.log",
  "aqi-sync-cron.log <> power-sync-cron.log",
  "aqi-sync-cron.log <> senior-tourism-sync-cron.log",
  "aqx-sync-cron.log <> culture-shows-cron.log",
  "aqx-sync-cron.log <> gdacs-cleanup-cron.log",
  "aqx-sync-cron.log <> news-card-images-cron.log",
  "aqx-sync-cron.log <> power-sync-cron.log",
  "carbon-footprint-coefficients-cron.log <> news-card-images-cron.log",
  "carbon-footprint-coefficients-cron.log <> power-sync-cron.log",
  "carbon-footprint-products-cron.log <> cwa-sync-cron.log",
  "cdc-alerts-cron.log <> cwa-sync-cron.log",
  "cleaning-squads-cron.log <> earthquakes-sync-cron.log",
  "cool-spots-cron.log <> earthquakes-sync-cron.log",
  "culture-shows-cron.log <> news-card-images-cron.log",
  "culture-shows-cron.log <> power-sync-cron.log",
  "cwa-sync-cron.log <> fsc-11198-stats-sync-cron.log",
  "cwa-sync-cron.log <> transit-accessibility-sync-cron.log",
  "emergency-rooms-sync-cron.log <> moda-165027-sync-cron.log",
  "facilities-hours-sync-cron.log <> news-card-images-cron.log",
  "facilities-hours-sync-cron.log <> power-sync-cron.log",
  "fraud-domains-sync-cron.log <> wra-iot-sync-cron.log",
  "gdacs-cleanup-cron.log <> news-card-images-cron.log",
  "gdacs-cleanup-cron.log <> power-sync-cron.log",
  "green-products-cron.log <> news-card-images-cron.log",
  "green-products-cron.log <> power-sync-cron.log",
  "iaq-premises-cron.log <> wra-sync-cron.log",
  "latest-books-sync-cron.log <> news-card-images-cron.log",
  "latest-books-sync-cron.log <> power-sync-cron.log",
  "news-card-images-cron.log <> power-sync-cron.log",
  "news-card-images-cron.log <> public-art-cron.log",
  "news-card-images-cron.log <> senior-tourism-sync-cron.log",
  "news-card-images-cron.log <> social-post-queue-cron.log",
  "news-card-images-cron.log <> transit-bus-sync-cron.log",
  "news-card-images-cron.log <> wra-catalog-sync-cron.log",
  "pest-alerts-sync-cron.log <> wra-iot-sync-cron.log",
  "police-172159-stats-sync-cron.log <> wra-water-outages-cron.log",
  "power-mix-sync-cron.log <> rss-sync-cron.log",
  "power-sync-cron.log <> public-art-cron.log",
  "power-sync-cron.log <> senior-tourism-sync-cron.log",
  "power-sync-cron.log <> social-post-queue-cron.log",
  "power-sync-cron.log <> transit-bus-sync-cron.log",
  "power-sync-cron.log <> wra-catalog-sync-cron.log",
  "senior-card-sync-cron.log <> water-outages-cron.log",
];

// --- the lint itself, against the real registerJobs.ts -----------------------

test("registerJobs.ts: every cron.schedule call is a literal expression the lint can read", () => {
  const jobs = extractCronSchedules(registerJobsSource);
  assert.ok(jobs.length > 0, "expected to find cron.schedule calls in registerJobs.ts");
  for (const job of jobs) {
    // parseCronExpression throws on anything it can't read.
    parseCronExpression(job.expression);
  }
  const names = jobs.map((job) => job.name);
  assert.equal(
    new Set(names).size,
    names.length,
    "every job needs its own runGuarded log name (the lint identifies jobs by it)",
  );
});

test("registerJobs.ts: no job shares a tick with another beyond the documented baseline", () => {
  const jobs = extractCronSchedules(registerJobsSource);
  const allowed = new Set([...KNOWN_EXCEPTIONS, ...LEGACY_BASELINE_COLLISIONS]);

  const fresh = findCronCollisions(jobs).filter((collision) => !allowed.has(collisionKey(collision)));
  const free = unusedMinutes(jobs);

  assert.deepEqual(
    fresh.map(
      (collision) =>
        `${collisionKey(collision)}  ("${collision.a.expression}" vs "${collision.b.expression}", ` +
        `same tick at minute ${collision.minutes.join(",")})`,
    ),
    [],
    "A cron job in registerJobs.ts fires in the same tick as another job. Move the new one to a minute " +
      `no other job uses (currently unused: ${free.join(", ")}), then re-run. ` +
      "Do not add to LEGACY_BASELINE_COLLISIONS.",
  );
});

test("the baseline is a list of named pairs, not a permit for an expression: a third job on 04:30 still fails", () => {
  const jobs = extractCronSchedules(registerJobsSource);
  const withThird = [...jobs, { expression: "30 4 * * *", name: "third-job-cron.log", line: 0 }];
  const allowed = new Set([...KNOWN_EXCEPTIONS, ...LEGACY_BASELINE_COLLISIONS]);
  const uncovered = findCronCollisions(withThird)
    .filter((collision) => !allowed.has(collisionKey(collision)))
    .map(collisionKey);

  assert.ok(uncovered.length > 0, "a brand-new job must never be covered by the existing baseline");
  assert.ok(uncovered.every((key) => key.includes("third-job-cron.log")));
});

// --- the lint's own logic -----------------------------------------------------

test("expandCronField handles *, lists, ranges, steps and the Sunday alias", () => {
  const minute = { name: "minute", min: 0, max: 59 };
  const dayOfWeek = { name: "dayOfWeek", min: 0, max: 7 };

  assert.equal(expandCronField("*", minute).size, 60);
  assert.deepEqual([...expandCronField("5,35", minute)], [5, 35]);
  assert.deepEqual([...expandCronField("10-13", minute)], [10, 11, 12, 13]);
  assert.deepEqual([...expandCronField("*/15", minute)], [0, 15, 30, 45]);
  assert.deepEqual([...expandCronField("5-20/5", minute)], [5, 10, 15, 20]);
  assert.deepEqual([...expandCronField("50/5", minute)], [50, 55]);
  // 0 and 7 are both Sunday and must not appear as two different days.
  assert.deepEqual([...expandCronField("0,7", dayOfWeek)], [0]);
  assert.deepEqual([...expandCronField("1-5", dayOfWeek)], [1, 2, 3, 4, 5]);
});

test("parseCronExpression rejects what it cannot read instead of silently skipping it", () => {
  assert.throws(() => parseCronExpression("* * * *"), /5-field/);
  assert.throws(() => parseCronExpression("0 */5 * * * *"), /5-field/);
  assert.throws(() => parseCronExpression("61 * * * *"), /outside 0-59/);
  assert.throws(() => parseCronExpression("* * * jan *"), /Unsupported token/);
  assert.throws(() => parseCronExpression("10-5 * * * *"), /Descending range/);
  assert.throws(() => parseCronExpression("*/0 * * * *"), /outside 1-59/);
});

test("sharedTickMinutes: same minute and hour on overlapping days collide", () => {
  // The real case that the old by-eye review missed: a daily 03:15 job and the
  // twice-hourly 15,45 job are in the same tick at 03:15 every day.
  assert.deepEqual(sharedTickMinutes("15,45 * * * *", "15 3 * * *"), [15]);
  assert.deepEqual(sharedTickMinutes("30 4 * * *", "30 4 * * *"), [30]);
  assert.deepEqual(sharedTickMinutes("*/10 * * * *", "0,30 * * * *"), [0, 30]);
});

test("sharedTickMinutes: different minute, hour, day-of-month, month or weekday do not collide", () => {
  assert.deepEqual(sharedTickMinutes("34 2 * * 1", "15 2,14 * * *"), []); // minute
  assert.deepEqual(sharedTickMinutes("30 4 * * *", "30 5 * * *"), []); // hour
  assert.deepEqual(sharedTickMinutes("29 5 2 * *", "29 5 3 * *"), []); // day of month
  assert.deepEqual(sharedTickMinutes("0 5 1 1 *", "0 5 1 2 *"), []); // month
  assert.deepEqual(sharedTickMinutes("0 4 * * 0", "0 4 * * 1-6"), []); // weekday
  assert.deepEqual(sharedTickMinutes("0 4 * * 0", "0 4 * * 7"), [0]); // 7 is Sunday too
});

test("sharedTickMinutes: a day-of-month job and a weekday job can land on the same day", () => {
  // "the 1st" and "Saturdays" coincide whenever the 1st is a Saturday, so the
  // lint has to treat them as a possible collision rather than guess.
  assert.deepEqual(sharedTickMinutes("15 5 1 * *", "15 5 * * 6"), [15]);
});

test("extractCronSchedules reads expressions and job names, ignoring commented-out jobs", () => {
  const source = `
    // cron.schedule("1 1 * * *", runGuarded("commented-out.log", () => 1));
    /* cron.schedule("2 2 * * *", runGuarded("block-commented.log", () => 1)); */
    cron.schedule(
      "5,35 * * * *",
      runGuarded("rss-sync-cron.log", () => runRssIngestion("internal-cron")),
    );
    cron.schedule("7 7 * * *", () => undefined);
  `;
  const jobs = extractCronSchedules(source);
  assert.deepEqual(
    jobs.map(({ expression, name }) => ({ expression, name })),
    [
      { expression: "5,35 * * * *", name: "rss-sync-cron.log" },
      { expression: "7 7 * * *", name: "line 8" },
    ],
  );
});

test("extractCronSchedules refuses a schedule it cannot read statically", () => {
  const source = `
    const EXPRESSION = "5 5 * * *";
    cron.schedule(EXPRESSION, runGuarded("hidden-cron.log", () => 1));
  `;
  assert.throws(() => extractCronSchedules(source), /string-literal/);
});

test("a newly added job on an occupied tick is reported, and one on a free minute is not", () => {
  const base = `
    cron.schedule("15,45 * * * *", runGuarded("cwa-sync-cron.log", () => 1));
    cron.schedule("*/5 * * * *", runGuarded("every-five-cron.log", () => 1));
  `;

  const colliding = extractCronSchedules(
    `${base}\n cron.schedule("15 3 * * *", runGuarded("new-job-cron.log", () => 1));`,
  );
  assert.deepEqual(findCronCollisions(colliding).map(collisionKey).sort(), [
    "cwa-sync-cron.log <> every-five-cron.log",
    "cwa-sync-cron.log <> new-job-cron.log",
    "every-five-cron.log <> new-job-cron.log",
  ]);

  const clean = extractCronSchedules(
    `${base}\n cron.schedule("34 2 * * 1", runGuarded("new-job-cron.log", () => 1));`,
  );
  assert.deepEqual(findCronCollisions(clean).map(collisionKey), [
    "cwa-sync-cron.log <> every-five-cron.log",
  ]);
});

test("unusedMinutes lists only minutes no job mentions at any hour", () => {
  const jobs = [
    { expression: "*/5 * * * *", name: "a" },
    { expression: "3,13 * * * *", name: "b" },
    { expression: "1 4 * * *", name: "c" },
  ];
  const free = unusedMinutes(jobs);
  assert.ok(free.includes(2));
  assert.ok(!free.includes(1));
  assert.ok(!free.includes(3));
  assert.ok(!free.includes(15));
  assert.equal(free.length, 60 - 12 - 2 - 1);
});
