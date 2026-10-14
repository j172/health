import assert from "node:assert/strict";
import test from "node:test";
import { classifyNewsTopics, ALL_TOPICS, isTopic } from "./classifyTopics.ts";

// Issue #565: 新聞主題標籤.
//
// classifyTopics.ts has zero imports of its own (no "@/" aliases, no JSON,
// no "server-only"), so this test imports it directly with an explicit
// ".ts" extension and needs none of the registerHooks loader shims the
// other lib/server/news/*.test.mjs files use — same as
// lib/constants/contextualPartners.test.mjs.

// ---------------------------------------------------------------------------
// Positive cases — one topic each
// ---------------------------------------------------------------------------

test("anti-fraud: 詐騙集團冒充公務員要求解除分期", () => {
  const topics = classifyNewsTopics({
    title: "詐騙集團假冒公務員電話要求被害人解除分期 警方緝獲車手3人",
  });
  assert.deepEqual(topics, ["anti-fraud"]);
});

test("anti-fraud: 165 專線撥打情境", () => {
  const topics = classifyNewsTopics({
    title: "民眾收到假投資訊息 立即撥打165專線查證避免受騙",
  });
  assert.deepEqual(topics, ["anti-fraud"]);
});

test("anti-drug: 警方查緝毒品案件", () => {
  const topics = classifyNewsTopics({
    title: "警方查緝毒品工廠 起出大量安非他命與愷他命",
  });
  assert.deepEqual(topics, ["anti-drug"]);
});

test("anti-drug: 毒品危害防制中心新聞應判為反毒", () => {
  const topics = classifyNewsTopics({
    title: "各縣市毒品危害防制中心加強戒毒個案追蹤服務",
  });
  assert.deepEqual(topics, ["anti-drug"]);
});

test("anti-drug: 喪屍煙彈示警", () => {
  const topics = classifyNewsTopics({
    title: "校園驚見喪屍煙彈 疑混入毒品成分",
  });
  assert.deepEqual(topics, ["anti-drug"]);
});

test("tobacco: 電子煙與加熱菸新興菸品宣導", () => {
  const topics = classifyNewsTopics({
    title: "國健署籲青少年遠離電子煙與加熱菸 違法菸品最高罰千萬",
  });
  assert.deepEqual(topics, ["tobacco"]);
});

test("tobacco: 戒菸門診與尼古丁替代療法", () => {
  const topics = classifyNewsTopics({
    title: "二代戒菸門診補助尼古丁替代療法 成功率大幅提升",
  });
  assert.deepEqual(topics, ["tobacco"]);
});

// ---------------------------------------------------------------------------
// Negative cases / boundary cases — acceptance-criteria call-outs
// ---------------------------------------------------------------------------

test("反例：毒蛇咬傷不得判成反毒", () => {
  const topics = classifyNewsTopics({
    title: "登山客遭毒蛇咬傷 緊急送醫注射血清",
  });
  assert.deepEqual(topics, []);
});

test("反例：毒蜘蛛、河豚毒等生物毒素新聞不得判成反毒", () => {
  assert.deepEqual(
    classifyNewsTopics({ title: "網購進口毒蜘蛛引發生態疑慮" }),
    [],
  );
  assert.deepEqual(
    classifyNewsTopics({ title: "誤食河豚毒中毒 3人送醫" }),
    [],
  );
});

test("反例：菸酒公賣局歷史新聞不得判成菸害", () => {
  const topics = classifyNewsTopics({
    title: "菸酒公賣局舊址將改建為文創園區",
  });
  assert.deepEqual(topics, []);
});

test("反例：製菸業相關產業新聞不得判成菸害", () => {
  const topics = classifyNewsTopics({
    title: "地方製菸業沒落 老菸廠轉型觀光工廠",
  });
  assert.deepEqual(topics, []);
});

test("反例：大麻布料／大麻繩等纖維製品不得判成反毒", () => {
  assert.deepEqual(
    classifyNewsTopics({ title: "手工大麻布包工藝展開幕" }),
    [],
  );
});

test("零主題：一般健康新聞不命中任何主題", () => {
  const topics = classifyNewsTopics({
    title: "秋冬進補食譜：薑母鴨、羊肉爐這樣吃更健康",
    summary: "營養師提醒攝取過量恐造成腸胃負擔",
  });
  assert.deepEqual(topics, []);
});

// ---------------------------------------------------------------------------
// Multi-topic
// ---------------------------------------------------------------------------

test("多主題：同一篇新聞可以同時命中防詐與菸害", () => {
  const topics = classifyNewsTopics({
    title: "網路賣場販售電子煙遭詐騙集團冒名行騙 警方籲民眾小心",
  });
  assert.equal(topics.length, 2);
  assert.ok(topics.includes("anti-fraud"));
  assert.ok(topics.includes("tobacco"));
});

test("多主題：summary 命中的關鍵字也要納入判斷", () => {
  const topics = classifyNewsTopics({
    title: "地方新聞：社區座談會圓滿落幕",
    summary: "座談會中也宣導戒毒資源與毒防中心轉介管道",
  });
  assert.deepEqual(topics, ["anti-drug"]);
});

// ---------------------------------------------------------------------------
// Source-direct-assignment overrides keyword matching
// ---------------------------------------------------------------------------

test("來源直接指定主題：命中時完全不跑關鍵字規則，即使標題暗示別的主題", () => {
  const overrides = { antidrug_frontline: ["anti-drug"] };
  const topics = classifyNewsTopics(
    {
      title: "分享健康食譜：薑母鴨這樣吃更養生", // would otherwise match nothing
      sourceName: "antidrug_frontline",
    },
    overrides,
  );
  assert.deepEqual(topics, ["anti-drug"]);
});

test("來源直接指定主題：即使標題關鍵字會命中別的主題，仍以來源指定為準", () => {
  const overrides = { antidrug_frontline: ["anti-drug"] };
  const topics = classifyNewsTopics(
    {
      title: "165專線籲民眾小心投資詐騙", // would otherwise match anti-fraud
      sourceName: "antidrug_frontline",
    },
    overrides,
  );
  assert.deepEqual(topics, ["anti-drug"]);
});

test("來源不在對照表裡時，照常跑關鍵字規則", () => {
  const overrides = { antidrug_frontline: ["anti-drug"] };
  const topics = classifyNewsTopics(
    { title: "詐騙集團假投資話術曝光", sourceName: "some_other_source" },
    overrides,
  );
  assert.deepEqual(topics, ["anti-fraud"]);
});

test("來源對照表可以指定多個主題", () => {
  const overrides = { multi_topic_source: ["anti-drug", "tobacco"] };
  const topics = classifyNewsTopics(
    { title: "完全不相關的標題", sourceName: "multi_topic_source" },
    overrides,
  );
  assert.deepEqual(topics, ["anti-drug", "tobacco"]);
});

// ---------------------------------------------------------------------------
// Misc / interface shape
// ---------------------------------------------------------------------------

test("空標題與空白輸入回傳空陣列，不拋出例外", () => {
  assert.deepEqual(classifyNewsTopics({ title: "" }), []);
  assert.deepEqual(classifyNewsTopics({ title: "   ", summary: "  " }), []);
});

test("ALL_TOPICS 與 isTopic 涵蓋三個主題", () => {
  assert.deepEqual(ALL_TOPICS, ["anti-fraud", "anti-drug", "tobacco"]);
  assert.ok(isTopic("anti-fraud"));
  assert.ok(isTopic("anti-drug"));
  assert.ok(isTopic("tobacco"));
  assert.ok(!isTopic("not-a-real-topic"));
});
