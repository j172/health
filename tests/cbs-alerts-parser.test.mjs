import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/register-ts-alias-hooks.mjs";

const { parseCbsFeedXml } = await import("../lib/server/disaster/cbsAlerts.ts");
const {
  parseCbsStatus,
  shouldShowCbsBanner,
  isCbsBannerExcludedPath,
} = await import("../lib/client/cbsAlertStore.ts");

const SAMPLE_CAP_ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>災防告警細胞廣播即時訊息</title>
  <updated>2026-10-24T06:00:00+08:00</updated>
  <id>https://cbs.tw/</id>
  <entry>
    <id>urn:oid:2.49.0.0.158.0.20261024001</id>
    <title>大雷雨即時訊息</title>
    <updated>2026-10-24T06:00:00+08:00</updated>
    <content type="text/xml">
      <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
        <identifier>20261024-CWA-001</identifier>
        <sender>cwa@cwa.gov.tw</sender>
        <sent>2026-10-24T06:00:00+08:00</sent>
        <status>Actual</status>
        <msgType>Alert</msgType>
        <scope>Public</scope>
        <info>
          <category>Met</category>
          <event>大雷雨即時訊息</event>
          <urgency>Immediate</urgency>
          <severity>Extreme</severity>
          <certainty>Observed</certainty>
          <effective>2026-10-24T06:00:00+08:00</effective>
          <expires>2026-10-24T08:00:00+08:00</expires>
          <headline>[災防告警] 10月24日06時00分發布大雷雨即時訊息</headline>
          <description>示警區域：花蓮縣秀林鄉、花蓮縣新城鄉。旺盛對流常伴隨打雷、閃電與劇烈降雨。</description>
          <web>https://cbs.tw</web>
          <area>
            <areaDesc>花蓮縣秀林鄉、花蓮縣新城鄉</areaDesc>
          </area>
        </info>
      </alert>
    </content>
  </entry>
</feed>`;

test("parseCbsFeedXml: 解析標準 ATOM 內嵌 CAP 1.2 XML，正確擷取告警欄位與示警區域", () => {
  const simulatedNow = Date.parse("2026-10-24T06:30:00+08:00");
  const alerts = parseCbsFeedXml(SAMPLE_CAP_ATOM_FEED, simulatedNow);

  assert.equal(alerts.length, 1);
  const alert = alerts[0];
  assert.equal(alert.id, "20261024-CWA-001");
  assert.equal(alert.event, "大雷雨即時訊息");
  assert.equal(alert.severity, "Extreme");
  assert.equal(alert.effective, "2026-10-24T06:00:00+08:00");
  assert.equal(alert.expires, "2026-10-24T08:00:00+08:00");
  assert.equal(alert.headline, "[災防告警] 10月24日06時00分發布大雷雨即時訊息");
  assert.match(alert.description, /花蓮縣秀林鄉/);
  assert.deepEqual(alert.areas, ["花蓮縣秀林鄉", "花蓮縣新城鄉"]);
  assert.equal(alert.web, "https://cbs.tw");
});

test("parseCbsFeedXml: 已過期告警自動過濾 (now > expires)", () => {
  const afterExpires = Date.parse("2026-10-24T08:00:01+08:00");
  const alerts = parseCbsFeedXml(SAMPLE_CAP_ATOM_FEED, afterExpires);
  assert.equal(alerts.length, 0, "過期告警不應被回傳");
});

test("parseCbsFeedXml: 支援多重 area 與逗號／頓號分隔解析", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <content type="text/xml">
        <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
          <identifier>EARTHQUAKE-20261024</identifier>
          <status>Actual</status>
          <msgType>Alert</msgType>
          <info>
            <event>地震速報</event>
            <urgency>Immediate</urgency>
            <severity>Severe</severity>
            <effective>2026-10-24T06:00:00+08:00</effective>
            <expires>2026-10-24T07:00:00+08:00</expires>
            <headline>地震速報</headline>
            <area><areaDesc>宜蘭縣南澳鄉、花蓮縣秀林鄉</areaDesc></area>
            <area><areaDesc>新北市坪林區, 桃園市復興區</areaDesc></area>
          </info>
        </alert>
      </content>
    </entry>
  </feed>`;

  const simulatedNow = Date.parse("2026-10-24T06:10:00+08:00");
  const alerts = parseCbsFeedXml(xml, simulatedNow);

  assert.equal(alerts.length, 1);
  assert.deepEqual(alerts[0].areas, [
    "宜蘭縣南澳鄉",
    "花蓮縣秀林鄉",
    "新北市坪林區",
    "桃園市復興區",
  ]);
});

test("parseCbsFeedXml: 過濾 Test / Draft 與 Cancel 類型訊息", () => {
  const testXml = `<?xml version="1.0" encoding="utf-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <content type="text/xml">
        <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
          <identifier>TEST-001</identifier>
          <status>Test</status>
          <msgType>Alert</msgType>
          <info>
            <event>測試訊息</event>
            <urgency>Immediate</urgency>
            <severity>Extreme</severity>
            <expires>2026-10-24T12:00:00+08:00</expires>
            <headline>測試</headline>
          </info>
        </alert>
      </content>
    </entry>
    <entry>
      <content type="text/xml">
        <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
          <identifier>CANCEL-002</identifier>
          <status>Actual</status>
          <msgType>Cancel</msgType>
          <info>
            <event>解除告警</event>
            <urgency>Immediate</urgency>
            <severity>Extreme</severity>
            <expires>2026-10-24T12:00:00+08:00</expires>
            <headline>解除</headline>
          </info>
        </alert>
      </content>
    </entry>
  </feed>`;

  const alerts = parseCbsFeedXml(testXml, Date.parse("2026-10-24T06:00:00+08:00"));
  assert.equal(alerts.length, 0, "測試與取消訊息不應被作為生效告警回傳");
});

test("parseCbsFeedXml: 邊界情況防禦（空字串、壞 XML、無 entry）", () => {
  assert.deepEqual(parseCbsFeedXml(""), []);
  assert.deepEqual(parseCbsFeedXml("   "), []);
  assert.deepEqual(parseCbsFeedXml("<not valid xml"), []);
  assert.deepEqual(parseCbsFeedXml("<feed><title>Empty</title></feed>"), []);
});

test("cbsAlertStore: shouldShowCbsBanner 與 isCbsBannerExcludedPath 行為驗證", () => {
  assert.equal(shouldShowCbsBanner(null), false);
  assert.equal(shouldShowCbsBanner(undefined), false);
  assert.equal(shouldShowCbsBanner({ hasActive: false, activeAlerts: [] }), false);
  assert.equal(
    shouldShowCbsBanner({
      hasActive: true,
      activeAlerts: [
        {
          id: "1",
          headline: "Alert",
          description: "Desc",
          event: "Event",
          severity: "Extreme",
          effective: "2026-10-24T00:00:00Z",
          expires: "2026-10-24T02:00:00Z",
          areas: ["全台"],
        },
      ],
    }),
    true,
  );

  assert.equal(isCbsBannerExcludedPath("/admin"), true);
  assert.equal(isCbsBannerExcludedPath("/admin/settings"), true);
  assert.equal(isCbsBannerExcludedPath("/embed/widget"), true);
  assert.equal(isCbsBannerExcludedPath("/"), false);
  assert.equal(isCbsBannerExcludedPath("/news"), false);
  assert.equal(isCbsBannerExcludedPath("/en/tools/disaster-map"), false);
});

test("cbsAlertStore: parseCbsStatus 容錯處理", () => {
  assert.deepEqual(parseCbsStatus(null), { hasActive: false, activeAlerts: [] });
  assert.deepEqual(parseCbsStatus({}), { hasActive: false, activeAlerts: [], lastUpdated: undefined });
  const parsed = parseCbsStatus({
    hasActive: true,
    activeAlerts: [
      {
        id: "cbs-123",
        headline: "海嘯警報",
        event: "海嘯警報",
        severity: "Extreme",
        expires: "2026-10-24T10:00:00Z",
        areas: ["基隆市", "新北市"],
      },
    ],
  });
  assert.equal(parsed.hasActive, true);
  assert.equal(parsed.activeAlerts.length, 1);
  assert.equal(parsed.activeAlerts[0].event, "海嘯警報");
});
