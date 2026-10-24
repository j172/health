import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getAiBudgetUsage,
  resetAiBudgetUsage,
  recordTokenUsage,
  clearPayloadHashCache,
  resolveRuleBasedLinking,
  resolveSemanticLinking,
  MAX_DAILY_COST_USD,
  getTaipeiDateString,
} from "../lib/server/ai/claudeBudgetGuard.ts";

test("Claude API Budget Guard - 初始狀態與常數限制", () => {
  resetAiBudgetUsage();
  clearPayloadHashCache();
  const usage = getAiBudgetUsage();

  assert.equal(usage.maxDailyCostUsd, 2.8);
  assert.equal(usage.dailyEstimatedCostUsd, 0);
  assert.equal(usage.isCircuitBroken, false);
  assert.equal(usage.totalCalls, 0);
  assert.equal(usage.cacheHits, 0);
  assert.equal(usage.fallbackCalls, 0);
  assert.equal(usage.date, getTaipeiDateString());
});

test("Claude API Budget Guard - Token 費用計算與累計", () => {
  resetAiBudgetUsage();
  // 1,000,000 input tokens = $0.80, 100,000 output tokens = $0.40 -> total $1.20
  const usage = recordTokenUsage(1_000_000, 100_000);

  assert.equal(usage.totalCalls, 1);
  assert.equal(usage.inputTokens, 1_000_000);
  assert.equal(usage.outputTokens, 100_000);
  assert.equal(usage.dailyEstimatedCostUsd, 1.2);
  assert.equal(usage.isCircuitBroken, false);
});

test("Claude API Budget Guard - 單日 $2.8 熔斷門檻觸發防護", () => {
  resetAiBudgetUsage();
  // 累計到 $2.80 以上觸發熔斷
  recordTokenUsage(2_500_000, 200_000); // 2.5 * 0.8 + 0.2 * 4 = 2.0 + 0.8 = 2.8
  const usage = getAiBudgetUsage();

  assert.ok(usage.dailyEstimatedCostUsd >= MAX_DAILY_COST_USD);
  assert.equal(usage.isCircuitBroken, true);
});

test("Claude API Budget Guard - 靜態規則映射（無國界醫生、特赦組織、國合會、反認知作戰）", () => {
  // 1. 無國界醫生 (MSF) -> global-watch
  const msfResult = resolveRuleBasedLinking({
    title: "無國界醫生展開地中海救援",
    sourceName: "msf",
    payloadHash: "hash-msf-1",
  });
  assert.deepEqual(msfResult.toolSlugs, ["global-watch"]);
  assert.equal(msfResult.actionUrl, "https://www.msf.org.tw/");
  assert.equal(msfResult.source, "rule-fallback");

  // 2. 國際特赦組織台灣分會 (Amnesty) -> npo-organizations
  const amnestyResult = resolveRuleBasedLinking({
    title: "全球緊急人權個案連署行動",
    sourceName: "amnesty",
    payloadHash: "hash-amnesty-1",
  });
  assert.deepEqual(amnestyResult.toolSlugs, ["npo-organizations"]);
  assert.equal(amnestyResult.actionUrl, "https://www.amnesty.tw/take-action");

  // 3. 國合會 (TaiwanICDF) -> npo-organizations 與 global-watch
  const icdfResult = resolveRuleBasedLinking({
    title: "國合會派遣海外公衛醫療技術團",
    sourceName: "icdf",
    payloadHash: "hash-icdf-1",
  });
  assert.deepEqual(icdfResult.toolSlugs, ["npo-organizations", "global-watch"]);
  assert.equal(icdfResult.actionUrl, "https://www.icdf.org.tw/");

  // 4. 反認知作戰教育網 (Anti Cognitive Warfare) -> anti-fraud
  const antiCwResult = resolveRuleBasedLinking({
    title: "拆解境外資訊戰假訊息網絡",
    sourceName: "anti_cw",
    payloadHash: "hash-anti-cw-1",
  });
  assert.deepEqual(antiCwResult.toolSlugs, ["anti-fraud"]);
  assert.equal(antiCwResult.actionUrl, "https://cw.yueyuknows.com/");
});

test("Claude API Budget Guard - 文章 Hash 快取（已處理文章 100% 走快取）", async () => {
  resetAiBudgetUsage();
  clearPayloadHashCache();

  const article = {
    title: "無國界醫生戰火難民醫療援助專案",
    sourceName: "msf",
    payloadHash: "fixed-unique-hash-12345",
  };

  // 第 1 次處理（無 API Key，走規則比對並快取）
  const result1 = await resolveSemanticLinking(article);
  assert.equal(result1.source, "rule-fallback");
  assert.deepEqual(result1.toolSlugs, ["global-watch"]);

  const usageAfterFirst = getAiBudgetUsage();
  assert.equal(usageAfterFirst.cacheHits, 0);
  assert.equal(usageAfterFirst.fallbackCalls, 1);

  // 第 2 次處理相同文章（命中 Hash 快取）
  const result2 = await resolveSemanticLinking(article);
  assert.equal(result2.source, "cache");
  assert.deepEqual(result2.toolSlugs, ["global-watch"]);

  const usageAfterSecond = getAiBudgetUsage();
  assert.equal(usageAfterSecond.cacheHits, 1);
  assert.equal(usageAfterSecond.fallbackCalls, 1);
});

test("Claude API Budget Guard - 熔斷後自動平滑降級為規則比對", async () => {
  resetAiBudgetUsage();
  clearPayloadHashCache();

  // 手動觸發熔斷
  recordTokenUsage(3_500_000, 0); // 3.5 * 0.8 = $2.8
  assert.equal(getAiBudgetUsage().isCircuitBroken, true);

  const article = {
    title: "國際特赦組織緊急倡議行動",
    sourceName: "amnesty",
    payloadHash: "amnesty-after-break-hash",
  };

  // 嘗試透過 AI 呼叫，但因熔斷而平滑降級為規則比對
  const result = await resolveSemanticLinking(article, {
    apiKey: "dummy-key",
    mockAiResult: { toolSlugs: ["custom-tool"], actionDigest: "mock" },
  });

  assert.equal(result.source, "rule-fallback");
  assert.deepEqual(result.toolSlugs, ["npo-organizations"]);
  assert.equal(getAiBudgetUsage().fallbackCalls, 1);
});
