// TDX 點數超額後的排程降載：事件觸發型的無障礙設施停用公告 job 由每 30 分鐘改成每小時一次，
// 保留原本的分鐘（16）。全台軌道營運通阻（metro-alerts，issue #728）與樂齡旅遊／敬老卡的三個
// 排程（issue #729）、無障礙交通的每日軌道同步與每日公車低地板同步（issue #730）已整個移除，
// 不再佔用 TDX 預算；無障礙交通只剩每小時電梯停用公告。每日 TDX 請求預算表見 docs/domains/10-scheduling-sync-ci.md。
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

test("transit-accessibility-alerts runs once an hour, at its old minute (16)", () => {
  const rail = jobNamed("transit-accessibility-alerts-cron.log");
  assert.equal(rail.expression, "16 * * * *");
  assert.equal(runsPerDay(rail.expression), 24);
});

test("no leftover half-hourly schedule for the halved jobs in code (comments may still mention the history)", () => {
  const code = source.replace(/\/\/.*$/gm, "");
  assert.ok(!/"16,46 \* \* \* \*"|"17,47 \* \* \* \*"/.test(code));
});

test("the daily TDX request count the schedules add up to (documented in docs/domains/10-scheduling-sync-ci.md)", () => {
  // requests per run (one request per system / city) x runs per day
  const perDay = {
    "transit-accessibility-alerts-cron.log": 10 * runsPerDay(jobNamed("transit-accessibility-alerts-cron.log").expression),
  };
  assert.deepEqual(perDay, {
    "transit-accessibility-alerts-cron.log": 240,
  });
});

test("the removed rail-alerts job (issue #728) no longer consumes any TDX budget", () => {
  assert.ok(!jobs.some((j) => /metro-alerts/.test(j.name)), "no metro-alerts-*-cron.log job may be registered");
});

test("the removed senior travel and senior card jobs (issue #729) no longer consume any TDX budget", () => {
  assert.ok(!jobs.some((j) => /^senior-/.test(j.name)), "no senior-* cron job may be registered");
});

test("the removed daily rail-accessibility and daily bus low-floor jobs (issue #730) no longer consume any TDX budget", () => {
  assert.ok(!jobs.some((j) => j.name === "transit-accessibility-sync-cron.log"), "no daily rail accessibility sync");
  assert.ok(!jobs.some((j) => j.name === "transit-bus-sync-cron.log"), "no daily bus low-floor sync");
  // 無障礙交通頁只剩一個 TDX 排程：每小時電梯停用公告。
  assert.deepEqual(
    jobs.filter((j) => /^transit-/.test(j.name)).map((j) => j.name),
    ["transit-accessibility-alerts-cron.log"],
  );
});
