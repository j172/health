// TDX 點數超額後的排程降載：兩個事件觸發型告警 job（無障礙設施停用公告、樂齡觀光設施停用公告）
// 由每 30 分鐘改成每小時一次，各自保留原本的分鐘（16／17）；軌道告警（metro-alerts）對使用者時效較
// 敏感，維持每 30 分鐘。每日 TDX 請求預算表見 docs/domains/10-scheduling-sync-ci.md。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractCronSchedules, parseCronExpression } from "./cronCollisions.mjs";

const source = readFileSync(new URL("./registerJobs.ts", import.meta.url), "utf8");
const jobs = extractCronSchedules(source);
const jobNamed = (name) => {
  const job = jobs.find((j) => j.name === name);
  assert.ok(job, `${name} is not registered`);
  return job;
};
const runsPerDay = (expression) => {
  const parsed = parseCronExpression(expression);
  return parsed.minute.size * parsed.hour.size;
};

test("transit-accessibility-alerts and senior-tourism-alerts run once an hour, at their old minutes (16 and 17)", () => {
  const rail = jobNamed("transit-accessibility-alerts-cron.log");
  const tourism = jobNamed("senior-tourism-alerts-cron.log");
  assert.equal(rail.expression, "16 * * * *");
  assert.equal(tourism.expression, "17 * * * *");
  assert.equal(runsPerDay(rail.expression), 24);
  assert.equal(runsPerDay(tourism.expression), 24);
});

test("rail alerts (metro-alerts) stay at every 30 minutes — they are the time-sensitive ones", () => {
  assert.equal(jobNamed("metro-alerts-sync-cron.log").expression, "0,30 * * * *");
});

test("no leftover half-hourly schedule for the two halved jobs in code (comments may still mention the history)", () => {
  const code = source.replace(/\/\/.*$/gm, "");
  assert.ok(!/"16,46 \* \* \* \*"|"17,47 \* \* \* \*"/.test(code));
});

test("the daily TDX request count the schedules add up to (documented in docs/domains/10-scheduling-sync-ci.md)", () => {
  // requests per run (one request per RailSystem / system / city) x runs per day
  const perDay = {
    "metro-alerts-sync-cron.log": 8 * runsPerDay(jobNamed("metro-alerts-sync-cron.log").expression),
    "transit-accessibility-alerts-cron.log": 10 * runsPerDay(jobNamed("transit-accessibility-alerts-cron.log").expression),
    "senior-tourism-alerts-cron.log": 1 * runsPerDay(jobNamed("senior-tourism-alerts-cron.log").expression),
  };
  assert.deepEqual(perDay, {
    "metro-alerts-sync-cron.log": 384,
    "transit-accessibility-alerts-cron.log": 240,
    "senior-tourism-alerts-cron.log": 24,
  });
});
