import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

const REPO_ROOT = new URL("../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
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
    return nextResolve(target, context);
  },
});

const { parsePlaBulletin, extractActivityDate, cleanBulletinText } = await import("./parser.ts");

test("cleanBulletinText removes HTML tags and normalizes spaces", () => {
  const dirty = "<p>國防部今（24）日表示&nbsp;&nbsp;，自昨（23）日0600時<br/>至今日0600時止。</p>";
  const cleaned = cleanBulletinText(dirty);
  assert.equal(cleaned, "國防部今（24）日表示 ，自昨（23）日0600時 至今日0600時止。");
});

test("extractActivityDate parses ROC calendar dates properly", () => {
  const title = "中共解放軍臺海周邊海、空域動態（民國115年10月24日）";
  const date = extractActivityDate(title);
  assert.equal(date, "2026-10-24");
});

test("extractActivityDate parses Gregorian dates properly", () => {
  const title = "中共解放軍臺海周邊海、空域動態（2026年10月24日）";
  const date = extractActivityDate(title);
  assert.equal(date, "2026-10-24");
});

test("parsePlaBulletin parses standard bulletin with crossings and official ships", () => {
  const content =
    "國防部今（24）日表示，自昨（23）日0600時至今日0600時止，偵獲共機 22 架次（其中逾越海峽中線進入北部、西南及東部空域 15 架次）、共艦 7 艘次及公務船 1 艘，持續在臺海周邊活動。國軍運用任務機、艦及岸置飛彈系統嚴密監控與應處。";
  const title = "中共解放軍臺海周邊海、空域動態（民國115年10月24日）";

  const result = parsePlaBulletin({
    title,
    content,
    activityDate: "2026-10-24",
    imageUrl: "https://www.mnd.gov.tw/upload/pla/20261024_pla_airspace.jpg",
    sourceUrl: "https://www.mnd.gov.tw/news/plaactdetail?id=115102401",
  });

  assert.equal(result.activityDate, "2026-10-24");
  assert.equal(result.periodStart, "2026-10-23 06:00:00");
  assert.equal(result.periodEnd, "2026-10-24 06:00:00");
  assert.equal(result.aircraftTotal, 22);
  assert.equal(result.aircraftCrossed, 15);
  assert.equal(result.vesselsTotal, 7);
  assert.equal(result.officialShipsTotal, 1);
  assert.ok(result.aircraftDetails?.includes("逾越海峽中線進入北部、西南及東部空域 15 架次"));
  assert.equal(result.imageUrl, "https://www.mnd.gov.tw/upload/pla/20261024_pla_airspace.jpg");
});

test("parsePlaBulletin parses day with 0 crossings and 0 official ships", () => {
  const content =
    "國防部今（20）日表示，自昨（19）日0600時至今日0600時止，偵獲共機 6 架次、共艦 4 艘次，持續在臺海周邊活動。國軍運用任務機、艦及岸置飛彈系統嚴密監控與應處。";
  const title = "中共解放軍臺海周邊海、空域動態（民國115年10月20日）";

  const result = parsePlaBulletin({
    title,
    content,
    activityDate: "2026-10-20",
  });

  assert.equal(result.activityDate, "2026-10-20");
  assert.equal(result.periodStart, "2026-10-19 06:00:00");
  assert.equal(result.periodEnd, "2026-10-20 06:00:00");
  assert.equal(result.aircraftTotal, 6);
  assert.equal(result.aircraftCrossed, 0);
  assert.equal(result.vesselsTotal, 4);
  assert.equal(result.officialShipsTotal, 0);
  assert.equal(result.aircraftDetails, null);
});

test("parsePlaBulletin parses high tension drill day with large counts", () => {
  const content =
    "國防部今（15）日表示，自10月14日0600時至10月15日0600時止，偵獲共機 153 架次（其中逾越海峽中線進入北部、中線、西南及東部空域 111 架次）、共艦 14 艘次及公務船 12 艘，持續在臺海周邊活動。國軍運用任務機、艦及岸置飛彈系統嚴密監控與應處。";
  const title = "中共解放軍臺海周邊海、空域動態（民國115年10月15日）";

  const result = parsePlaBulletin({
    title,
    content,
    activityDate: "2026-10-15",
  });

  assert.equal(result.aircraftTotal, 153);
  assert.equal(result.aircraftCrossed, 111);
  assert.equal(result.vesselsTotal, 14);
  assert.equal(result.officialShipsTotal, 12);
  assert.equal(result.periodStart, "2026-10-14 06:00:00");
  assert.equal(result.periodEnd, "2026-10-15 06:00:00");
});

test("parsePlaBulletin handles malformed or empty text gracefully", () => {
  const result = parsePlaBulletin({
    content: "查無最新動態公告",
    activityDate: "2026-10-01",
  });

  assert.equal(result.activityDate, "2026-10-01");
  assert.equal(result.aircraftTotal, 0);
  assert.equal(result.aircraftCrossed, 0);
  assert.equal(result.vesselsTotal, 0);
  assert.equal(result.officialShipsTotal, 0);
  assert.ok(result.periodStart !== null);
  assert.ok(result.periodEnd !== null);
});
