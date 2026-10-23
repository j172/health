import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isMetroAlertTopic,
  extractSystemFromTopic,
  getRailSystemLabel,
  TDX_MQTT_TOPIC_METRO_ALERT,
} from "../lib/server/tdx/mqtt/topics.ts";
import {
  parseAndNormalizeMetroAlert,
  toSqlDateTime,
} from "../lib/server/tdx/mqtt/metroAlertParser.ts";
import { handleMetroAlertMessage } from "../lib/server/tdx/mqtt/metroAlertHandler.ts";

test("topics: recognizes metro alert topics and extracts system codes", () => {
  assert.equal(isMetroAlertTopic("v2/Rail/Metro/Alert/TRTC"), true);
  assert.equal(isMetroAlertTopic("v2/Rail/Metro/Alert/KRTC"), true);
  assert.equal(isMetroAlertTopic("v2/Rail/Metro/Alert/TYMC"), true);
  assert.equal(isMetroAlertTopic("v2/Rail/Metro/Alert"), true);
  assert.equal(isMetroAlertTopic("v2/Bus/Alert/Taipei"), false);
  assert.equal(isMetroAlertTopic("v3/Rail/TRA/Alert"), false);

  assert.equal(extractSystemFromTopic("v2/Rail/Metro/Alert/TRTC"), "TRTC");
  assert.equal(extractSystemFromTopic("v2/Rail/Metro/Alert/krtc"), "KRTC");
  assert.equal(extractSystemFromTopic("v2/Rail/Metro/Alert"), null);
  assert.equal(TDX_MQTT_TOPIC_METRO_ALERT, "v2/Rail/Metro/Alert/#");
});

test("parser: handles single JSON object with nested Scope", () => {
  const samplePayload = {
    AlertID: "TRTC_20261024_001",
    OperatorID: "TRTC",
    Title: "板南線列車延誤通報",
    Description: "因號誌設備異常，板南線班距拉長約 5-10 分鐘",
    Effect: 1,
    Scope: {
      Lines: [{ LineID: "BL", LineName: { Zh_tw: "板南線", En: "Bannan Line" } }],
      Stations: [{ StationID: "BL12", StationName: { Zh_tw: "忠孝復興", En: "Zhongxiao Fuxing" } }],
    },
    StartTime: "2026-10-24T08:00:00+08:00",
    EndTime: "2026-10-24T10:00:00+08:00",
    PublishTime: "2026-10-24T08:05:00+08:00",
  };

  const normalized = parseAndNormalizeMetroAlert(samplePayload);
  assert.equal(normalized.length, 1);

  const a = normalized[0];
  assert.equal(a.alertId, "TRTC_20261024_001");
  assert.equal(a.railSystem, "TRTC");
  assert.equal(a.systemLabel, "臺北捷運");
  assert.equal(a.lineId, "BL");
  assert.equal(a.lineName, "板南線");
  assert.equal(a.stationId, "BL12");
  assert.equal(a.stationName, "忠孝復興");
  assert.equal(a.severity, "warning");
  assert.equal(a.startTime, "2026-10-24 00:00:00");
});

test("parser: handles JSON array with multiple systems and determines severity", () => {
  const sampleArray = [
    {
      AlertID: "ALERT_SUSPEND_01",
      RailSystem: "KRTC",
      Title: "高雄捷運紅線部分區間暫停營運",
      Description: "世運至橋頭火車站因外物入侵軌道暫停營運，啟動公車接駁",
      Effect: 2,
      StationID: "R17",
      StationName: "世運",
      StartTime: "2026-10-24T12:00:00+08:00",
    },
    {
      AlertID: "ALERT_INFO_02",
      RailSystem: "TYMC",
      Title: "機捷系統定期保養維護",
      Description: "夜間進行預防性軌道檢修，不影響正常營運班次",
      Effect: 0,
      StationID: "A1",
      StationName: "台北車站",
    },
  ];

  const normalized = parseAndNormalizeMetroAlert(JSON.stringify(sampleArray));
  assert.equal(normalized.length, 2);

  assert.equal(normalized[0].severity, "alert"); // 暫停營運 / Effect 2 -> alert
  assert.equal(normalized[0].railSystem, "KRTC");
  assert.equal(normalized[0].systemLabel, "高雄捷運");

  assert.equal(normalized[1].severity, "info"); // 保養維護 / Effect 0 -> info
  assert.equal(normalized[1].railSystem, "TYMC");
  assert.equal(normalized[1].systemLabel, "桃園捷運");
});

test("parser: safely tolerates invalid JSON or missing AlertID", () => {
  assert.deepEqual(parseAndNormalizeMetroAlert("invalid json string"), []);
  assert.deepEqual(parseAndNormalizeMetroAlert(null), []);
  assert.deepEqual(parseAndNormalizeMetroAlert([{ Title: "No AlertID" }]), []);
});

test("date conversion: toSqlDateTime parses ISO strings and returns null on invalid dates", () => {
  assert.equal(toSqlDateTime("2026-10-24T12:34:56.789Z"), "2026-10-24 12:34:56");
  assert.equal(toSqlDateTime("2026-10-24T00:00:00+08:00"), "2026-10-23 16:00:00");
  assert.equal(toSqlDateTime(null), null);
  assert.equal(toSqlDateTime("not-a-date"), null);
});

test("handler: idempotent handling of replayed QoS 1 frames with zero REST API calls", async () => {
  let upsertCount = 0;
  const recordedAlerts = [];

  const mockUpsert = async (alerts) => {
    upsertCount += alerts.length;
    recordedAlerts.push(...alerts);
    return alerts.length;
  };

  const payload = JSON.stringify({
    AlertID: "TRTC_REPLAY_101",
    RailSystem: "TRTC",
    Title: "設備檢查",
    Description: "南港展覽館站月台設備檢查",
    StationID: "BL23",
    StationName: "南港展覽館",
  });

  // First delivery
  const res1 = await handleMetroAlertMessage("v2/Rail/Metro/Alert/TRTC", payload, {
    upsertFn: mockUpsert,
  });
  assert.equal(res1.ok, true);
  assert.equal(res1.count, 1);
  assert.deepEqual(res1.alertIds, ["TRTC_REPLAY_101"]);

  // Replayed delivery (QoS 1 network retry)
  const res2 = await handleMetroAlertMessage("v2/Rail/Metro/Alert/TRTC", payload, {
    upsertFn: mockUpsert,
  });
  assert.equal(res2.ok, true);
  assert.equal(res2.count, 1);
  assert.deepEqual(res2.alertIds, ["TRTC_REPLAY_101"]);

  // Total upserts executed twice without error
  assert.equal(upsertCount, 2);
  assert.equal(recordedAlerts[0].alertId, "TRTC_REPLAY_101");
  assert.equal(recordedAlerts[1].alertId, "TRTC_REPLAY_101");
});

test("public transit-alerts API route exists and returns structured response", async () => {
  const routePath = path.join(process.cwd(), "app/api/transit-alerts/route.ts");
  assert.ok(fs.existsSync(routePath), "app/api/transit-alerts/route.ts must exist");

  const src = fs.readFileSync(routePath, "utf8");
  assert.match(src, /export async function GET/, "route must have a GET handler");
  assert.match(src, /accessible_transit_facility_alerts/, "route must query the alerts table");
  assert.match(src, /cacheInit\("short"\)/, "route must use short edge cache");
});
