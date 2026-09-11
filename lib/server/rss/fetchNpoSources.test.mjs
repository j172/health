import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { RSS_FEEDS } = await import("../config/rss-feeds.ts");
const { getSourceLabel, hasSourceLabel } = await import("../news/sourceLabels.ts");
const { SOURCE_CATEGORIES } = await import("../news/sourceCategories.ts");
const { CATEGORY_LABELS } = await import("../culture/types.ts");
const { parseYmdToUtc } = await import("./fetchNpoSources.ts");

test("NPO: goh_news is configured in RSS_FEEDS with skipDetailFetch", () => {
  const gohFeed = RSS_FEEDS.find((f) => f.code === "goh_news");
  assert.ok(gohFeed, "goh_news must be registered in RSS_FEEDS");
  assert.equal(gohFeed.sourceName, "goh");
  assert.equal(gohFeed.skipDetailFetch, true);
  assert.equal(gohFeed.url, "https://www.goh.org.tw/feed/");
});

test("NPO: SOURCE_LABELS contains all required NPO sources", () => {
  const required = [
    ["amnesty", "國際特赦組織台灣分會"],
    ["npo_tw", "台灣公益資訊中心"],
    ["down_syndrome", "唐氏症基金會"],
    ["worldvision", "台灣世界展望會"],
    ["goh", "勵馨基金會"],
    ["syinlu", "心路基金會"],
    ["worldpeace", "世界和平會"],
    ["greenpeace", "綠色和平"],
    ["ibt", "盲人重建院"],
    ["ccf", "家扶基金會"],
    ["unitedway", "聯合勸募"],
    ["eden", "伊甸基金會"],
    ["elder", "華山基金會"],
    ["savedogs", "台灣動物緊急救援小組"],
    ["igiving", "iGiving 公益網"],
    ["csr_cw_social", "CSR@天下 社會共好"],
    ["caresb", "照顧情報"],
    ["nncf", "羅慧夫顱顏基金會"],
    ["chilingjj", "志玲姊姊慈善基金會"],
    ["anews", "愛傳媒"],
  ];
  for (const [sourceName, expectedLabel] of required) {
    assert.ok(hasSourceLabel(sourceName), `${sourceName} should have a mapped label`);
    assert.equal(getSourceLabel(sourceName), expectedLabel);
  }
});

test("NPO: SOURCE_CATEGORIES contains 'npo' (公益社福) category with all 20 sources", () => {
  const npoCategory = SOURCE_CATEGORIES.find((c) => c.key === "npo");
  assert.ok(npoCategory, "SOURCE_CATEGORIES must contain 'npo' group");
  assert.equal(npoCategory.label, "公益社福");

  const sourceNames = npoCategory.sources.map((s) => s.sourceName);
  const expected = [
    "amnesty",
    "npo_tw",
    "down_syndrome",
    "worldvision",
    "goh",
    "syinlu",
    "worldpeace",
    "greenpeace",
    "ibt",
    "ccf",
    "unitedway",
    "eden",
    "elder",
    "savedogs",
    "igiving",
    "csr_cw_social",
    "caresb",
    "nncf",
    "chilingjj",
    "anews",
  ];
  for (const exp of expected) {
    assert.ok(sourceNames.includes(exp), `${exp} must be in npo category sources`);
  }
});

test("NPO: Culture types has 'npo' category label '🤝 公益活動'", () => {
  assert.equal(CATEGORY_LABELS["npo"], "🤝 公益活動");
});

test("NPO: parseYmdToUtc correctly parses various Taiwan date formats", () => {
  const d1 = parseYmdToUtc("2026/09/09");
  assert.ok(d1);
  assert.equal(d1.getUTCFullYear(), 2026);
  assert.equal(d1.getUTCMonth(), 8); // 0-indexed: September is 8
  assert.equal(d1.getUTCDate(), 9);

  const d2 = parseYmdToUtc("2026-09-08");
  assert.ok(d2);
  assert.equal(d2.getUTCFullYear(), 2026);
  assert.equal(d2.getUTCMonth(), 8);
  assert.equal(d2.getUTCDate(), 8);

  const d3 = parseYmdToUtc("2026.08.12");
  assert.ok(d3);
  assert.equal(d3.getUTCFullYear(), 2026);
  assert.equal(d3.getUTCMonth(), 7); // August is 7
  assert.equal(d3.getUTCDate(), 12);

  const d4 = parseYmdToUtc("2026 年 9 月 7 日");
  assert.ok(d4);
  assert.equal(d4.getUTCFullYear(), 2026);
  assert.equal(d4.getUTCMonth(), 8);
  assert.equal(d4.getUTCDate(), 7);

  assert.equal(parseYmdToUtc(null), null);
  assert.equal(parseYmdToUtc(""), null);
  assert.equal(parseYmdToUtc("invalid-date"), null);
});
