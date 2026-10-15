import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
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

const { parseAntidrugListHtml, parseRocDateToUtc } = await import("./fetchAntidrugNews.ts");
const { getSourceLabel, hasSourceLabel } = await import("../news/sourceLabels.ts");
const { SOURCE_CATEGORIES, isGovSource } = await import("../news/sourceCategories.ts");
const { classifyNewsTopics, SOURCE_TOPIC_OVERRIDES } = await import("../news/classifyTopics.ts");

const fixturePath = new URL("./__fixtures__/antidrug-news-list.html", import.meta.url);
const fixtureHtml = readFileSync(fixturePath, "utf-8");

test("antidrug: source label and gov category registration", () => {
  assert.equal(getSourceLabel("antidrug"), "反毒大本營");
  assert.equal(hasSourceLabel("antidrug"), true);
  assert.equal(isGovSource("antidrug"), true);

  const govCat = SOURCE_CATEGORIES.find((c) => c.key === "gov");
  assert.ok(govCat);
  assert.ok(govCat.sources.some((s) => s.sourceName === "antidrug" && s.label === "反毒大本營"));
});

test("antidrug: source override pins every article to anti-drug regardless of keywords", () => {
  assert.deepEqual(SOURCE_TOPIC_OVERRIDES.antidrug, ["anti-drug"]);

  // A title with no anti-drug keyword at all must still classify as anti-drug
  // once sourceName is "antidrug" — the override bypasses TOPIC_RULES entirely.
  const topics = classifyNewsTopics({
    title: "國慶大會預演交通管制",
    summary: "",
    sourceName: "antidrug",
  });
  assert.deepEqual(topics, ["anti-drug"]);
});

test("parseRocDateToUtc converts ROC year to the correct UTC instant", () => {
  const d = parseRocDateToUtc("115-10-12");
  assert.ok(d instanceof Date);
  // 2026-10-12 00:00 Taipei (+08:00) -> 2026-10-11 16:00 UTC
  assert.equal(d.toISOString(), "2026-10-11T16:00:00.000Z");
});

test("parseRocDateToUtc returns null for malformed input", () => {
  assert.equal(parseRocDateToUtc("not-a-date"), null);
  assert.equal(parseRocDateToUtc(""), null);
});

test("parseAntidrugListHtml extracts real sampled list items correctly", () => {
  const items = parseAntidrugListHtml(fixtureHtml);
  assert.equal(items.length, 5);

  const first = items[0];
  assert.equal(first.title, "攻堅毒品分裝場⋯警跨區追到土城摩鐵 逮毒鴛鴦");
  assert.equal(first.canonicalUrl, "https://news.ltn.com.tw/news/society/paper/1774179");
  assert.equal(first.sourceLabel, "自由時報");
  assert.equal(first.publishedAtUtc.toISOString(), "2026-10-11T16:00:00.000Z");

  const yahooItem = items[3];
  assert.equal(yahooItem.sourceLabel, "Yahoo");
  assert.ok(yahooItem.canonicalUrl.startsWith("https://tw.news.yahoo.com/"));

  // Every sampled entry links straight to the real outlet's own domain, not
  // back into antidrug.moj.gov.tw — confirmed live, see module comment.
  for (const item of items) {
    assert.ok(!item.canonicalUrl.includes("antidrug.moj.gov.tw"));
  }
});

test("parseAntidrugListHtml handles empty/malformed HTML gracefully", () => {
  const items = parseAntidrugListHtml("<div><p>沒有任何新聞清單</p></div>");
  assert.equal(items.length, 0);
});
