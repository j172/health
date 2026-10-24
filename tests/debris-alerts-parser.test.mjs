import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/register-ts-alias-hooks.mjs";

const {
  parseDebrisAlertsJson,
  groupDebrisAlertsByCounty,
  getDebrisAlertsForCounty,
  hasActiveDebrisAlerts,
  MOA_DEBRIS_ALERT_URL,
  MOA_DEBRIS_HISTORICAL_DATASET_ID,
} = await import("../lib/server/disaster/debrisAlerts.ts");

const SAMPLE_DEBRIS_JSON = JSON.stringify([
  {
    AlertLevel: "紅色警戒",
    ReleaseTime: "2026-10-24 07:30",
    DebrisStreamCode: "DF001",
    County: "花蓮縣",
    Township: "秀林鄉",
    Village: "富世村",
  },
  {
    AlertLevel: "黃色警戒",
    ReleaseTime: "2026-10-24 07:30",
    DebrisStreamCode: "DF002",
    County: "花蓮縣",
    Township: "秀林鄉",
    Village: "崇德村",
  },
  {
    AlertLevel: "黃色警戒",
    ReleaseTime: "2026-10-24 07:30",
    DebrisStreamCode: "DF003",
    County: "宜蘭縣",
    Township: "南澳鄉",
    Village: "金岳村",
  },
]);

test("MOA 土石流資料集常數驗證 (UnitId=018 與歷史 7284)", () => {
  assert.equal(MOA_DEBRIS_HISTORICAL_DATASET_ID, "7284");
  assert.match(MOA_DEBRIS_ALERT_URL, /UnitId=018/);
  assert.match(MOA_DEBRIS_ALERT_URL, /GetCustomerDebrisAlertInfo\.aspx/);
});

test("parseDebrisAlertsJson: 正確解析水保署 OpenAPI JSON，標準化紅黃警戒與村里清冊", () => {
  const alerts = parseDebrisAlertsJson(SAMPLE_DEBRIS_JSON);

  assert.equal(alerts.length, 3);
  // Red alert sorted first
  assert.equal(alerts[0].alertLevel, "紅色警戒");
  assert.equal(alerts[0].county, "花蓮縣");
  assert.equal(alerts[0].township, "秀林鄉");
  assert.equal(alerts[0].village, "富世村");
  assert.equal(alerts[0].debrisStreamCode, "DF001");
  assert.equal(alerts[0].releaseTime, "2026-10-24 07:30");

  assert.equal(alerts[1].alertLevel, "黃色警戒");
});

test("groupDebrisAlertsByCounty: 聚合統計各縣市與鄉鎮之紅黃警戒數量", () => {
  const alerts = parseDebrisAlertsJson(SAMPLE_DEBRIS_JSON);
  const grouped = groupDebrisAlertsByCounty(alerts);

  assert.equal(grouped.length, 2);
  const hualien = grouped.find((g) => g.county === "花蓮縣");
  assert.ok(hualien);
  assert.equal(hualien.redCount, 1);
  assert.equal(hualien.yellowCount, 1);
  assert.equal(hualien.totalCount, 2);
  assert.equal(hualien.townships.length, 1);
  assert.equal(hualien.townships[0].township, "秀林鄉");
  assert.equal(hualien.townships[0].villages.length, 2);

  const yilan = grouped.find((g) => g.county === "宜蘭縣");
  assert.ok(yilan);
  assert.equal(yilan.redCount, 0);
  assert.equal(yilan.yellowCount, 1);
  assert.equal(yilan.totalCount, 1);
});

test("getDebrisAlertsForCounty: 依縣市過濾土石流警戒溪流清冊", () => {
  const alerts = parseDebrisAlertsJson(SAMPLE_DEBRIS_JSON);

  const hlAlerts = getDebrisAlertsForCounty("花蓮縣", alerts);
  assert.equal(hlAlerts.length, 2);

  const ylAlerts = getDebrisAlertsForCounty("宜蘭縣", alerts);
  assert.equal(ylAlerts.length, 1);

  const tpAlerts = getDebrisAlertsForCounty("台北市", alerts);
  assert.equal(tpAlerts.length, 0);
});

test("hasActiveDebrisAlerts: 判斷是否有生效中土石流警戒", () => {
  assert.equal(hasActiveDebrisAlerts([]), false);
  assert.equal(hasActiveDebrisAlerts(null), false);
  assert.equal(hasActiveDebrisAlerts(parseDebrisAlertsJson(SAMPLE_DEBRIS_JSON)), true);
});

test("parseDebrisAlertsJson: 容錯與邊界案例（空陣列、無警戒、非預期物件包裝）", () => {
  assert.deepEqual(parseDebrisAlertsJson(""), []);
  assert.deepEqual(parseDebrisAlertsJson("[]"), []);
  assert.deepEqual(parseDebrisAlertsJson("{}"), []);
  assert.deepEqual(parseDebrisAlertsJson("{ bad json"), []);

  // Wrapped format { data: [...] }
  const wrapped = {
    data: [
      {
        AlertLevel: "紅色警戒",
        County: "南投縣",
        Township: "信義鄉",
        Village: "神木村",
      },
    ],
  };
  const parsedWrapped = parseDebrisAlertsJson(wrapped);
  assert.equal(parsedWrapped.length, 1);
  assert.equal(parsedWrapped[0].county, "南投縣");
  assert.equal(parsedWrapped[0].township, "信義鄉");
  assert.equal(parsedWrapped[0].village, "神木村");
});
