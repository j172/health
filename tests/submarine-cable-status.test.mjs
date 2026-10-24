import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/register-ts-alias-hooks.mjs";

const {
  parseSubmarineCableIncidents,
  STATUS_LABELS,
  SUBMARINE_CABLE_INCIDENTS_URL,
} = await import("../lib/server/resilience/submarineCableService.ts");

test("SUBMARINE_CABLE_INCIDENTS_URL 常數正確指向 smc.peering.tw 上游", () => {
  assert.equal(
    SUBMARINE_CABLE_INCIDENTS_URL,
    "https://raw.githubusercontent.com/seadog007/smc.peering.tw/master/src/data/incidents.json",
  );
});

test("Test empty incident array -> returns NORMAL", () => {
  const result = parseSubmarineCableIncidents("[]");

  assert.equal(result.status, "NORMAL");
  assert.equal(result.statusLabel, STATUS_LABELS.NORMAL);
  assert.equal(result.activeIncidentsCount, 0);
  assert.deepEqual(result.incidents, []);
  assert.ok(result.updatedAt);
});

test("Test 1 non-critical cut -> returns DEGRADED", () => {
  const payload = JSON.stringify([
    {
      id: "inc-apcn2-1",
      cable_id: "apcn-2",
      cable_name: "APCN-2 亞太二號海纜",
      incident_type: "cut",
      status: "active",
      occurred_at: "2026-10-24T08:00:00Z",
      estimated_repair_at: "2026-11-20T12:00:00Z",
      impact_summary: "淡水端外海斷纖，流量已分流至備援海纜",
      affected_isps: ["CHT", "NCIC"],
    },
  ]);

  const result = parseSubmarineCableIncidents(payload);

  assert.equal(result.status, "DEGRADED");
  assert.equal(result.statusLabel, STATUS_LABELS.DEGRADED);
  assert.equal(result.activeIncidentsCount, 1);
  assert.equal(result.incidents.length, 1);
  assert.equal(result.incidents[0].cable_id, "apcn-2");
  assert.equal(result.incidents[0].incident_type, "cut");
});

test("Test 3 cuts -> returns CRITICAL", () => {
  const payload = JSON.stringify([
    {
      id: "inc-1",
      cable_id: "apcn-2",
      cable_name: "APCN-2 亞太二號海纜",
      incident_type: "cut",
      status: "active",
      occurred_at: "2026-10-24T08:00:00Z",
      estimated_repair_at: null,
      impact_summary: "多點斷纜",
      affected_isps: ["CHT"],
    },
    {
      id: "inc-2",
      cable_id: "sjc2",
      cable_name: "SJC2 東南亞日本二號海纜",
      incident_type: "cut",
      status: "repairing",
      occurred_at: "2026-10-24T09:00:00Z",
      estimated_repair_at: "2026-12-01T00:00:00Z",
      impact_summary: "維修船調度中",
      affected_isps: ["CHT", "FET"],
    },
    {
      id: "inc-3",
      cable_id: "tpe",
      cable_name: "TPE 跨太平洋快捷海纜",
      incident_type: "cut",
      status: "active",
      occurred_at: "2026-10-24T10:00:00Z",
      estimated_repair_at: null,
      impact_summary: "深海段斷纜",
      affected_isps: ["TWM"],
    },
  ]);

  const result = parseSubmarineCableIncidents(payload);

  assert.equal(result.status, "CRITICAL");
  assert.equal(result.statusLabel, STATUS_LABELS.CRITICAL);
  assert.equal(result.activeIncidentsCount, 3);
  assert.equal(result.incidents.length, 3);
});

test("Test Taiwan-Matsu ('臺馬' / '台馬') cut -> returns CRITICAL", () => {
  // Case A: 臺馬第二海纜 (單一障礙即觸發離島孤島警戒 CRITICAL)
  const matsuCut1 = JSON.stringify([
    {
      id: "matsu-2",
      cable_id: "taiwan-matsu-2",
      cable_name: "臺馬第二海纜",
      incident_type: "cut",
      status: "active",
      occurred_at: "2026-10-24T02:15:00Z",
      estimated_repair_at: "2026-11-30T00:00:00Z",
      impact_summary: "連江縣馬祖南北竿微波備援啟用中",
      affected_isps: ["CHT"],
    },
  ]);

  const result1 = parseSubmarineCableIncidents(matsuCut1);
  assert.equal(result1.status, "CRITICAL");
  assert.equal(result1.statusLabel, STATUS_LABELS.CRITICAL);
  assert.equal(result1.activeIncidentsCount, 1);

  // Case B: 台馬第三海纜 (異體字「台馬」支援)
  const matsuCut2 = JSON.stringify([
    {
      id: "matsu-3",
      cable_id: "tm-3",
      cable_name: "台馬第三海纜",
      incident_type: "cut",
      status: "repairing",
      occurred_at: "2026-10-24T03:00:00Z",
      estimated_repair_at: null,
      impact_summary: "台馬第三海纜訊號中斷",
      affected_isps: ["CHT"],
    },
  ]);

  const result2 = parseSubmarineCableIncidents(matsuCut2);
  assert.equal(result2.status, "CRITICAL");
  assert.equal(result2.statusLabel, STATUS_LABELS.CRITICAL);
  assert.equal(result2.activeIncidentsCount, 1);

  // Case C: 已修復的臺馬海纜不應觸發 CRITICAL
  const resolvedMatsu = JSON.stringify([
    {
      id: "matsu-resolved",
      cable_id: "tm-2",
      cable_name: "臺馬第二海纜",
      incident_type: "cut",
      status: "resolved",
      occurred_at: "2026-09-01T00:00:00Z",
      estimated_repair_at: "2026-09-15T00:00:00Z",
      impact_summary: "已完全修復並恢復正常供訊",
      affected_isps: ["CHT"],
    },
  ]);

  const resultResolved = parseSubmarineCableIncidents(resolvedMatsu);
  assert.equal(resultResolved.status, "NORMAL");
  assert.equal(resultResolved.activeIncidentsCount, 0);
});

test("Test corrupted JSON handling -> graceful fallback", () => {
  const corruptInputs = [
    "{ invalid: json, broken: [",
    "<!DOCTYPE html><html><body>Error 404</body></html>",
    "",
    "   ",
    "null",
    "undefined",
    "12345",
    "\"a plain string\"",
    "{ \"notAnArray\": 123 }",
  ];

  for (const input of corruptInputs) {
    const fallback = parseSubmarineCableIncidents(input);
    assert.equal(fallback.status, "NORMAL");
    assert.equal(fallback.statusLabel, STATUS_LABELS.NORMAL);
    assert.equal(fallback.activeIncidentsCount, 0);
    assert.deepEqual(fallback.incidents, []);
    assert.ok(fallback.updatedAt);
  }
});

test("支援包裝物件結構 { incidents: [...], updated_at: '...' }", () => {
  const wrappedPayload = JSON.stringify({
    updated_at: "2026-10-24T12:00:00Z",
    incidents: [
      {
        id: "inc-sea-me-we-3",
        cable_id: "smw3",
        cable_name: "SMW3 法新歐亞三號海纜",
        incident_type: "fault",
        status: "active",
        occurred_at: "2026-10-24T06:00:00Z",
        estimated_repair_at: null,
        impact_summary: "部分芯線傳輸異常",
        affected_isps: ["CHT"],
      },
    ],
  });

  const res = parseSubmarineCableIncidents(wrappedPayload);
  assert.equal(res.status, "DEGRADED");
  assert.equal(res.activeIncidentsCount, 1);
  assert.equal(res.updatedAt, "2026-10-24T12:00:00Z");
});
