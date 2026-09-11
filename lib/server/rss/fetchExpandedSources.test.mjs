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
const {
  parseTaiwanDateToUtc,
  parseYonglinHtml,
  parseChildrenEventsHtml,
  parseChildrenResearchHtml,
  parseMoeFamilyEduHtml,
  parseSfaaNewsHtml,
  parseHelloYishiHealthHtml,
  parseCommonHealthClubHtml,
  parseTheNewsLensHtml,
  parsePchomeHtml,
} = await import("./fetchExpandedSources.ts");

test("Phase 3: 6 standard RSS feeds are properly registered in RSS_FEEDS", () => {
  const codes = RSS_FEEDS.map((f) => f.code);
  const expectedStandardRss = [
    "wegetcare_blog",
    "grinews_life",
    "grinews_health",
    "ettoday_pet",
    "ettoday_health",
    "ncl_fmevents",
  ];

  for (const code of expectedStandardRss) {
    assert.ok(codes.includes(code), `RSS_FEEDS must contain ${code}`);
  }

  // Check skipDetailFetch configurations
  const wegetcare = RSS_FEEDS.find((f) => f.code === "wegetcare_blog");
  assert.equal(wegetcare?.skipDetailFetch, true);

  const ettodayPet = RSS_FEEDS.find((f) => f.code === "ettoday_pet");
  assert.equal(ettodayPet?.skipDetailFetch, true);

  const ncl = RSS_FEEDS.find((f) => f.code === "ncl_fmevents");
  assert.equal(ncl?.skipDetailFetch, false); // NCL is official, full text enabled
});

test("Phase 3: source labels are correctly registered in SOURCE_LABELS", () => {
  const expectedLabels = [
    ["yonglin", "永齡基金會"],
    ["children", "兒童福利聯盟"],
    ["moe_familyedu", "教育部家庭教育網"],
    ["sfaa", "衛生福利部社會及家庭署"],
    ["grinews", "草根影響力新視野"],
    ["thenewslens", "關鍵評論網"],
    ["pchome", "PChome 新聞"],
    ["ncl", "國家圖書館"],
    ["helloyishi", "Hello 醫師"],
    ["commonhealth_club", "康健大人社團"],
    ["ettoday", "ETtoday健康雲"],
    ["wegetcare", "醫聯網"],
  ];

  for (const [sourceName, label] of expectedLabels) {
    assert.ok(hasSourceLabel(sourceName), `hasSourceLabel(${sourceName}) must be true`);
    assert.equal(getSourceLabel(sourceName), label, `getSourceLabel(${sourceName}) should match`);
  }
});

test("Phase 3: source categories correctly map gov, npo, and media sources", () => {
  const govCategory = SOURCE_CATEGORIES.find((c) => c.key === "gov");
  assert.ok(govCategory, "gov category must exist");
  const govSources = govCategory.sources.map((s) => s.sourceName);
  assert.ok(govSources.includes("moe_familyedu"), "gov category must include moe_familyedu");
  assert.ok(govSources.includes("sfaa"), "gov category must include sfaa");
  assert.ok(govSources.includes("ncl"), "gov category must include ncl");

  const npoCategory = SOURCE_CATEGORIES.find((c) => c.key === "npo");
  assert.ok(npoCategory, "npo category must exist");
  const npoSources = npoCategory.sources.map((s) => s.sourceName);
  assert.ok(npoSources.includes("yonglin"), "npo category must include yonglin");
  assert.ok(npoSources.includes("children"), "npo category must include children");

  const mediaCategory = SOURCE_CATEGORIES.find((c) => c.key === "media");
  assert.ok(mediaCategory, "media category must exist");
  const mediaSources = mediaCategory.sources.map((s) => s.sourceName);
  assert.ok(mediaSources.includes("grinews"), "media category must include grinews");
  assert.ok(mediaSources.includes("thenewslens"), "media category must include thenewslens");
  assert.ok(mediaSources.includes("pchome"), "media category must include pchome");
});

test("Phase 3: parseTaiwanDateToUtc parses Gregorian, ROC years, and relative times", () => {
  // Gregorian
  const d1 = parseTaiwanDateToUtc("2026/09/11");
  assert.ok(d1);
  assert.equal(d1.getUTCFullYear(), 2026);
  assert.equal(d1.getUTCMonth(), 8);
  assert.equal(d1.getUTCDate(), 11);

  // Taiwan ROC Year (115 -> 2026)
  const dRoc = parseTaiwanDateToUtc("115/09/11");
  assert.ok(dRoc);
  assert.equal(dRoc.getUTCFullYear(), 2026);
  assert.equal(dRoc.getUTCMonth(), 8);
  assert.equal(dRoc.getUTCDate(), 11);

  // Chinese year format
  const dChinese = parseTaiwanDateToUtc("2026年9月11日");
  assert.ok(dChinese);
  assert.equal(dChinese.getUTCFullYear(), 2026);
  assert.equal(dChinese.getUTCMonth(), 8);
  assert.equal(dChinese.getUTCDate(), 11);

  // Relative times
  const baseNow = new Date("2026-09-11T12:00:00Z");
  const dHour = parseTaiwanDateToUtc("2 小時前", baseNow);
  assert.ok(dHour);
  assert.equal(dHour.getTime(), baseNow.getTime() - 2 * 3600 * 1000);

  const dMin = parseTaiwanDateToUtc("15 分鐘前", baseNow);
  assert.ok(dMin);
  assert.equal(dMin.getTime(), baseNow.getTime() - 15 * 60 * 1000);

  const dToday = parseTaiwanDateToUtc("今天", baseNow);
  assert.equal(dToday?.getTime(), baseNow.getTime());

  // Invalids
  assert.equal(parseTaiwanDateToUtc(null), null);
  assert.equal(parseTaiwanDateToUtc(""), null);
});

test("Phase 3: parseYonglinHtml parses Yonglin Foundation news listing", () => {
  const sampleHtml = `
    <div class="news-list">
      <div class="news-item">
        <a href="/news/detail/101">
          <img src="/images/news101.jpg" alt="永齡希望小學" />
          <h3 class="title">永齡希望小學數位課輔計畫正式啟動</h3>
          <span class="date">2026-09-10</span>
          <p class="summary">為偏鄉學童提供完整課後輔導資源與雙語科技教育。</p>
        </a>
      </div>
    </div>
  `;
  const items = parseYonglinHtml(sampleHtml, "https://www.yonglin.org.tw");
  assert.equal(items.length, 1);
  assert.equal(items[0].feedCode, "yonglin_news");
  assert.equal(items[0].sourceName, "yonglin");
  assert.equal(items[0].title, "永齡希望小學數位課輔計畫正式啟動");
  assert.equal(items[0].canonicalUrl, "https://www.yonglin.org.tw/news/detail/101");
  assert.ok(items[0].assets && items[0].assets.length > 0);
  assert.equal(items[0].assets[0].url, "https://www.yonglin.org.tw/images/news101.jpg");
});

test("Phase 3: parseChildrenEventsHtml & parseChildrenResearchHtml parse Children Welfare League", () => {
  const eventsHtml = `
    <div class="events-list">
      <div class="list-box">
        <a href="/news/detail/505">
          <h4 class="title">兒少心理健康諮詢專線擴大服務公告</h4>
          <span class="date">2026/09/08</span>
          <p class="desc">全國兒少心理健康專業諮詢與陪伴計畫。</p>
        </a>
      </div>
    </div>
  `;
  const eventItems = parseChildrenEventsHtml(eventsHtml, "https://www.children.org.tw");
  assert.equal(eventItems.length, 1);
  assert.equal(eventItems[0].feedCode, "children_events");
  assert.equal(eventItems[0].title, "兒少心理健康諮詢專線擴大服務公告");

  const researchHtml = `
    <div class="research-grid">
      <div class="research-item">
        <a href="/publication_research/detail/88">
          <h3 class="title">2026 台灣兒少網路使用與心理健康調查報告</h3>
          <span class="date">2026-08-30</span>
          <p class="summary">針對全台近萬名學童進行之網路使用與身心影響實證研究。</p>
        </a>
      </div>
    </div>
  `;
  const researchItems = parseChildrenResearchHtml(researchHtml, "https://www.children.org.tw");
  assert.equal(researchItems.length, 1);
  assert.equal(researchItems[0].feedCode, "children_research");
  assert.equal(researchItems[0].title, "2026 台灣兒少網路使用與心理健康調查報告");
});

test("Phase 3: parseMoeFamilyEduHtml and parseSfaaNewsHtml parse official government listings", () => {
  const moeHtml = `
    <table class="list-table">
      <tr>
        <td>115/09/05</td>
        <td><a href="docDetail.aspx?uid=28&pid=27&docid=999" title="家庭教育專業人員培訓計畫研習簡章">家庭教育專業人員培訓計畫研習簡章</a></td>
      </tr>
    </table>
  `;
  const moeItems = parseMoeFamilyEduHtml(moeHtml, "https://familyedu.moe.gov.tw");
  assert.equal(moeItems.length, 1);
  assert.equal(moeItems[0].feedCode, "moe_familyedu");
  assert.equal(moeItems[0].sourceName, "moe_familyedu");
  assert.equal(moeItems[0].title, "家庭教育專業人員培訓計畫研習簡章");
  assert.ok(moeItems[0].publishedAtUtc);

  const sfaaHtml = `
    <ul class="list">
      <li class="list-item">
        <span class="date">115-09-02</span>
        <a href="/sfaa/detail/777" title="衛生福利部推展社會福利服務補助作業要點修正公告">衛生福利部推展社會福利服務補助作業要點修正公告</a>
      </li>
    </ul>
  `;
  const sfaaItems = parseSfaaNewsHtml(sfaaHtml, "https://www.sfaa.gov.tw");
  assert.equal(sfaaItems.length, 1);
  assert.equal(sfaaItems[0].feedCode, "sfaa_news");
  assert.equal(sfaaItems[0].sourceName, "sfaa");
  assert.equal(sfaaItems[0].title, "衛生福利部推展社會福利服務補助作業要點修正公告");
  assert.ok(sfaaItems[0].publishedAtUtc);
});

test("Phase 3: parseTheNewsLensHtml and parsePchomeHtml parse media cards", () => {
  const tnlHtml = `
    <div class="articles">
      <div class="article-card">
        <a href="/article/198234">
          <img src="https://image.thenewslens.com/cover.jpg" />
          <h2 class="title">熟齡族群的防跌肌力訓練指南：醫師親授居家三大關鍵動作</h2>
          <span class="date">2026/09/09</span>
          <p class="desc">銀髮健康保健專欄。</p>
        </a>
      </div>
    </div>
  `;
  const tnlItems = parseTheNewsLensHtml(tnlHtml, "thenewslens_elderly", "關鍵評論網－銀髮");
  assert.equal(tnlItems.length, 1);
  assert.equal(tnlItems[0].feedCode, "thenewslens_elderly");
  assert.equal(tnlItems[0].sourceName, "thenewslens");
  assert.equal(tnlItems[0].title, "熟齡族群的防跌肌力訓練指南：醫師親授居家三大關鍵動作");

  const pchomeHtml = `
    <ul class="news_list">
      <li>
        <a href="https://news.pchome.com.tw/cat/healthcare/article/123456789.html">
          <h3 class="title">秋季換季過敏鼻塞？耳鼻喉科醫師教你日常自我照護法</h3>
          <span class="date">2026-09-11 10:30:00</span>
          <p class="summary">換季溫差大，鼻過敏困擾患者增多。</p>
        </a>
      </li>
    </ul>
  `;
  const pchomeItems = parsePchomeHtml(pchomeHtml, "pchome_health", "PChome－健康新聞");
  assert.equal(pchomeItems.length, 1);
  assert.equal(pchomeItems[0].feedCode, "pchome_health");
  assert.equal(pchomeItems[0].sourceName, "pchome");
  assert.equal(pchomeItems[0].title, "秋季換季過敏鼻塞？耳鼻喉科醫師教你日常自我照護法");
});
