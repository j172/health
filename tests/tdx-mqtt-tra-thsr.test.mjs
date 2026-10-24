import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

const REPO_ROOT = new URL("../", import.meta.url);

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
        if (fs.existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const content = fs.readFileSync(fileURLToPath(url), "utf8");
      return {
        format: "json",
        source: content,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const {
  isTraAlertTopic,
  isThsrAlertTopic,
  isRailDisruptionTopic,
  isMetroAlertTopic,
  getRailSystemLabel,
  RAIL_SYSTEM_LABELS,
  TDX_MQTT_TOPIC_TRA_ALERT,
  TDX_MQTT_TOPIC_THSR_ALERT,
} = await import("../lib/server/tdx/mqtt/topics.ts");

const {
  parseAndNormalizeTraAlert,
  parseAndNormalizeThsrAlert,
  toSqlDateTime,
} = await import("../lib/server/tdx/mqtt/railAlertParser.ts");

const {
  handleTraAlertMessage,
  handleThsrAlertMessage,
} = await import("../lib/server/tdx/mqtt/railAlertHandler.ts");

const { TRANSIT_EMERGENCY_HOTLINES } = await import("../lib/transit/disasterHotlines.ts");
const { cleanTelUri } = await import("../lib/utils/phoneUtils.mjs");
const { GUIDES, buildGuide } = await import("../lib/server/tools/navModel.ts");
const { getLocalizedGuideMeta, TRANSLATED_GUIDE_SLUGS } = await import(
  "../lib/i18n/guideContent.ts"
);

test("topics: recognizes TRA and THSR alert topics and exports friendly labels", () => {
  assert.equal(TDX_MQTT_TOPIC_TRA_ALERT, "v3/Rail/TRA/Alert");
  assert.equal(TDX_MQTT_TOPIC_THSR_ALERT, "v2/Rail/THSR/AlertInfo");

  assert.equal(isTraAlertTopic("v3/Rail/TRA/Alert"), true);
  assert.equal(isTraAlertTopic("v3/Rail/TRA/Alert/North"), true);
  assert.equal(isTraAlertTopic("v2/Rail/THSR/AlertInfo"), false);
  assert.equal(isTraAlertTopic("v2/Rail/Metro/Alert/TRTC"), false);

  assert.equal(isThsrAlertTopic("v2/Rail/THSR/AlertInfo"), true);
  assert.equal(isThsrAlertTopic("v2/Rail/THSR/AlertInfo/Update"), true);
  assert.equal(isThsrAlertTopic("v3/Rail/TRA/Alert"), false);

  assert.equal(isRailDisruptionTopic("v3/Rail/TRA/Alert"), true);
  assert.equal(isRailDisruptionTopic("v2/Rail/THSR/AlertInfo"), true);
  assert.equal(isRailDisruptionTopic("v2/Rail/Metro/Alert/TRTC"), true);
  assert.equal(isRailDisruptionTopic("v2/Bus/Alert/Taipei"), false);

  assert.equal(getRailSystemLabel("TRA"), "臺灣鐵路");
  assert.equal(getRailSystemLabel("THSR"), "台灣高鐵");
  assert.equal(RAIL_SYSTEM_LABELS["TRA"], "臺灣鐵路");
  assert.equal(RAIL_SYSTEM_LABELS["THSR"], "台灣高鐵");
});

test("parser: handles TDX V3 TRA alert payloads with Station & Line Scope", () => {
  const traPayload = {
    Alerts: [
      {
        AlertID: "TRA_20261024_001",
        Title: "宜蘭線礁溪至頭城間電車線故障",
        Description: "因受強風豪雨影響，礁溪至頭城間下行單線運轉，部分列車延誤 15-25 分鐘",
        Effect: 1,
        Scope: {
          Lines: [{ LineID: "IL", LineName: { Zh_tw: "宜蘭線", En: "Yilan Line" } }],
          Stations: [{ StationID: "1810", StationName: { Zh_tw: "礁溪", En: "Jiaoxi" } }],
        },
        StartTime: "2026-10-24T14:00:00+08:00",
        EndTime: "2026-10-24T18:00:00+08:00",
        PublishTime: "2026-10-24T14:15:00+08:00",
      },
      {
        AlertID: "TRA_20261024_002",
        Title: "花東線部分路段預警性停駛",
        Description: "颱風風雨加劇，花蓮至臺東間各級列車預警性停駛",
        Effect: 2,
        Scope: {
          LineSections: [
            {
              FromStationID: "7000",
              FromStationName: { Zh_tw: "花蓮", En: "Hualien" },
              ToStationID: "6000",
              ToStationName: { Zh_tw: "臺東", En: "Taitung" },
            },
          ],
        },
        StartTime: "2026-10-24T16:00:00+08:00",
        PublishTime: "2026-10-24T15:30:00+08:00",
      },
    ],
  };

  const normalized = parseAndNormalizeTraAlert(traPayload);
  assert.equal(normalized.length, 2);

  const a1 = normalized[0];
  assert.equal(a1.alertId, "TRA_20261024_001");
  assert.equal(a1.railSystem, "TRA");
  assert.equal(a1.systemLabel, "臺灣鐵路");
  assert.equal(a1.stationId, "1810");
  assert.equal(a1.stationName, "礁溪");
  assert.equal(a1.lineId, "IL");
  assert.equal(a1.lineName, "宜蘭線");
  assert.equal(a1.severity, "warning");
  assert.equal(a1.startTime, "2026-10-24 06:00:00");

  const a2 = normalized[1];
  assert.equal(a2.alertId, "TRA_20261024_002");
  assert.equal(a2.railSystem, "TRA");
  assert.equal(a2.stationName, "花蓮 至 臺東");
  assert.equal(a2.severity, "alert"); // 預警性停駛 / Effect 2 -> alert
});

test("parser: handles TDX V2 THSR alert payloads with status and array wrapping", () => {
  const thsrPayload = {
    AlertInfo: [
      {
        AlertID: "THSR_20261024_TYPHOON_01",
        Title: "台灣高鐵防颱營運調整公告",
        Description: "受中度颱風影響，全線列車降速運轉，台中以南區間視風速實施減班",
        Status: 1,
        StartTime: "2026-10-24T12:00:00+08:00",
        EndTime: "2026-10-24T23:59:59+08:00",
        PublishTime: "2026-10-24T10:00:00+08:00",
      },
      {
        AlertID: "THSR_20261024_EQ_02",
        Title: "東部海域強震告警系統作動",
        Description: "地震儀偵測超過警戒值，南港至板橋區間暫停營運巡檢",
        Status: 2,
        StartTime: "2026-10-24T15:00:00+08:00",
      },
    ],
  };

  const normalized = parseAndNormalizeThsrAlert(JSON.stringify(thsrPayload));
  assert.equal(normalized.length, 2);

  const t1 = normalized[0];
  assert.equal(t1.alertId, "THSR_20261024_TYPHOON_01");
  assert.equal(t1.railSystem, "THSR");
  assert.equal(t1.systemLabel, "台灣高鐵");
  assert.equal(t1.stationId, "ALL");
  assert.equal(t1.stationName, "台灣高鐵全線");
  assert.equal(t1.severity, "warning");

  const t2 = normalized[1];
  assert.equal(t2.alertId, "THSR_20261024_EQ_02");
  assert.equal(t2.railSystem, "THSR");
  assert.equal(t2.severity, "alert"); // 暫停營運 / Status 2 -> alert
});

test("parser: tolerates malformed or empty payloads safely", () => {
  assert.deepEqual(parseAndNormalizeTraAlert(null), []);
  assert.deepEqual(parseAndNormalizeTraAlert("invalid-json"), []);
  assert.deepEqual(parseAndNormalizeTraAlert([{ Invalid: true }]), []);

  assert.deepEqual(parseAndNormalizeThsrAlert(null), []);
  assert.deepEqual(parseAndNormalizeThsrAlert("invalid-json"), []);
  assert.deepEqual(parseAndNormalizeThsrAlert([{ Invalid: true }]), []);
});

test("handlers: station dimension join and idempotent upsert under QoS 1 replay", async () => {
  let traUpsertCount = 0;
  const traRecorded = [];

  const mockTraUpsert = async (alerts) => {
    traUpsertCount += alerts.length;
    traRecorded.push(...alerts);
    return alerts.length;
  };

  const mockResolveStation = async (system, id, name) => {
    if (id === "1000") {
      return { stationId: "1000", stationName: "臺北火車站", county: "臺北市" };
    }
    return { stationId: id, stationName: name || id };
  };

  const traPayload = JSON.stringify({
    Alerts: [
      {
        AlertID: "TRA_TEST_QOS1",
        Title: "臺北車站月台號誌調整",
        Description: "臺北站部分北上列車慢行",
        StationID: "1000",
        StartTime: "2026-10-24T08:00:00+08:00",
      },
    ],
  });

  // First delivery
  const res1 = await handleTraAlertMessage("v3/Rail/TRA/Alert", traPayload, {
    upsertFn: mockTraUpsert,
    resolveStationFn: mockResolveStation,
  });
  assert.equal(res1.ok, true);
  assert.equal(res1.count, 1);
  assert.deepEqual(res1.alertIds, ["TRA_TEST_QOS1"]);

  // Station enriched
  assert.equal(traRecorded[0].stationName, "臺北火車站");

  // QoS 1 Redelivery
  const res2 = await handleTraAlertMessage("v3/Rail/TRA/Alert", traPayload, {
    upsertFn: mockTraUpsert,
    resolveStationFn: mockResolveStation,
  });
  assert.equal(res2.ok, true);
  assert.equal(traUpsertCount, 2);

  // THSR handler test
  let thsrUpsertCount = 0;
  const mockThsrUpsert = async (alerts) => {
    thsrUpsertCount += alerts.length;
    return alerts.length;
  };

  const thsrRes = await handleThsrAlertMessage(
    "v2/Rail/THSR/AlertInfo",
    JSON.stringify({
      AlertID: "THSR_TEST_01",
      Title: "高鐵正常運轉",
      Status: 0,
    }),
    { upsertFn: mockThsrUpsert },
  );
  assert.equal(thsrRes.ok, true);
  assert.equal(thsrRes.count, 1);
  assert.equal(thsrUpsertCount, 1);
});

test("disaster hub: emergency hotlines are clean tel URIs matching specifications", () => {
  const operators = TRANSIT_EMERGENCY_HOTLINES.map((h) => h.operator);
  assert.deepEqual(operators, ["TRA", "THSR", "TRTC", "KRTC"]);

  const tra = TRANSIT_EMERGENCY_HOTLINES.find((h) => h.operator === "TRA");
  assert.ok(tra);
  assert.equal(tra.nameZh, "臺灣鐵路");
  assert.equal(tra.phones[0].number, "0800-765-888");
  assert.equal(tra.phones[0].telUri, "tel:0800765888");
  assert.equal(tra.phones[1].number, "02-2191-0096");
  assert.equal(tra.phones[1].telUri, "tel:0221910096");

  const thsr = TRANSIT_EMERGENCY_HOTLINES.find((h) => h.operator === "THSR");
  assert.ok(thsr);
  assert.equal(thsr.nameZh, "台灣高鐵");
  assert.equal(thsr.phones[0].number, "02-4066-3000");
  assert.equal(thsr.phones[0].telUri, "tel:0240663000");

  const trtc = TRANSIT_EMERGENCY_HOTLINES.find((h) => h.operator === "TRTC");
  assert.ok(trtc);
  assert.equal(trtc.phones[0].number, "02-218-12345");
  assert.equal(trtc.phones[0].telUri, "tel:0221812345");

  const krtc = TRANSIT_EMERGENCY_HOTLINES.find((h) => h.operator === "KRTC");
  assert.ok(krtc);
  assert.equal(krtc.phones[0].number, "07-793-8888");
  assert.equal(krtc.phones[0].telUri, "tel:077938888");

  // Every single hotline phone must match cleanTelUri output
  for (const h of TRANSIT_EMERGENCY_HOTLINES) {
    for (const p of h.phones) {
      assert.equal(p.telUri, cleanTelUri(p.number));
      assert.match(p.telUri, /^tel:\+?\d+$/);
    }
  }
});

test("disaster hub: typhoon-earthquake guide includes transit suspension step and cross-links", () => {
  const guide = GUIDES.find((g) => g.slug === "typhoon-earthquake");
  assert.ok(guide, "typhoon-earthquake guide must exist");

  const transitStep = guide.steps.find((s) => s.toolSlug === "accessible-transit");
  assert.ok(transitStep, "accessible-transit step must be registered in typhoon-earthquake");
  assert.equal(transitStep.caption, "查詢鐵路與大眾運輸停駛");
  assert.match(transitStep.why, /臺鐵、高鐵與各都會捷運/);
  assert.match(transitStep.why, /客服專線/);

  // Model resolution
  const model = buildGuide("typhoon-earthquake");
  const modelStep = model.steps.find((s) => s.toolSlug === "accessible-transit");
  assert.ok(modelStep);
  assert.equal(modelStep.href, "/tools/accessible-transit");

  // i18n completeness across en, ja, ko
  for (const locale of ["en", "ja", "ko"]) {
    const meta = getLocalizedGuideMeta("typhoon-earthquake", locale);
    const step = meta.steps["accessible-transit"];
    assert.ok(step, `${locale}: accessible-transit step must exist`);
    assert.ok(step.caption?.trim(), `${locale}: caption must be non-empty`);
    assert.ok(step.why?.trim(), `${locale}: why must be non-empty`);
    assert.notEqual(step.caption, transitStep.caption, `${locale}: caption must be translated`);
    assert.notEqual(step.why, transitStep.why, `${locale}: why must be translated`);
  }
});

test("guardrail #728: new modules contain zero references to retired tokens", () => {
  const filesToCheck = [
    "lib/server/tdx/mqtt/topics.ts",
    "lib/server/tdx/mqtt/railAlertParser.ts",
    "lib/server/tdx/mqtt/railAlertHandler.ts",
    "lib/server/tdx/mqtt/worker.ts",
    "lib/transit/disasterHotlines.ts",
    "components/Tools/TransitSuspensionSection.tsx",
    "tests/tdx-mqtt-tra-thsr.test.mjs",
  ];

  const forbiddenPattern = new RegExp(["metro", "alerts"].join("_") + "|" + ["metro", "Alerts"].join(""), "i");

  for (const file of filesToCheck) {
    const fullPath = path.join(fileURLToPath(REPO_ROOT), file);
    assert.ok(fs.existsSync(fullPath), `${file} must exist`);
    const code = fs.readFileSync(fullPath, "utf8");
    assert.doesNotMatch(
      code,
      forbiddenPattern,
      `${file} must not contain retired tokens`,
    );
  }
});
