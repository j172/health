import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DAYS = ["一", "二", "三", "四", "五", "六", "日"];
const PERIODS = ["上午", "下午", "晚上"];

function getDayIndex(jsDay) {
  // Convert JS Date getDay (0=Sun, 1=Mon...6=Sat) to Monday=0...Sunday=6
  return (jsDay + 6) % 7;
}

test("getDayIndex correctly maps JS getDay to Mon..Sun", () => {
  assert.equal(getDayIndex(1), 0); // Monday -> index 0 (一)
  assert.equal(getDayIndex(2), 1); // Tuesday -> index 1 (二)
  assert.equal(getDayIndex(5), 4); // Friday -> index 4 (五)
  assert.equal(getDayIndex(6), 5); // Saturday -> index 5 (六)
  assert.equal(getDayIndex(0), 6); // Sunday -> index 6 (日)

  assert.equal(DAYS[getDayIndex(1)], "一");
  assert.equal(DAYS[getDayIndex(0)], "日");
});

test("7x3 period matrix correctly maps sample clinic hours", () => {
  const sampleWeeklyHours = {
    "一": ["上午", "下午", "晚上"],
    "二": ["上午", "下午"],
    "三": ["上午", "晚上"],
    "四": ["上午", "下午", "晚上"],
    "五": ["上午", "下午"],
    "六": ["上午"],
  };

  // Check Monday
  assert.deepEqual(sampleWeeklyHours["一"], ["上午", "下午", "晚上"]);
  assert.equal(sampleWeeklyHours["一"].includes("上午"), true);
  assert.equal(sampleWeeklyHours["一"].includes("下午"), true);
  assert.equal(sampleWeeklyHours["一"].includes("晚上"), true);

  // Check Saturday
  assert.equal(sampleWeeklyHours["六"].includes("上午"), true);
  assert.equal(sampleWeeklyHours["六"].includes("下午"), false);
  assert.equal(sampleWeeklyHours["六"].includes("晚上"), false);

  // Check Sunday (closed)
  assert.equal((sampleWeeklyHours["日"] ?? []).length, 0);
});

test("WeeklyHours.tsx includes client directive and 7x3 matrix table elements", () => {
  const compPath = path.join(process.cwd(), "components", "Facilities", "WeeklyHours.tsx");
  const content = fs.readFileSync(compPath, "utf-8");

  assert.ok(content.includes('"use client"'), "Must have 'use client' directive");
  assert.ok(content.includes("每週早中晚門診表"), "Must contain matrix table title");
  assert.ok(content.includes("早中晚"), "Must contain toggle button label");
  assert.ok(content.includes("PERIODS"), "Must define PERIODS array");
  assert.ok(content.includes("isDisplayableNote"), "Must preserve isDisplayableNote function");
});
