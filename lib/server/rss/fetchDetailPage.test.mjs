// Unit tests for fetchDetailPage's per-source chrome scoping (issue #71) —
// run with `npm test`.
//
// Same setup as locationPrecision.test.mjs / administrativeArea.test.mjs:
// node:test + node:assert only, no framework, Node >= 22.18 for unflagged type
// stripping. See locationPrecision.test.mjs for the full rationale.
//
// Two extra resolver cases beyond those files, because fetchDetailPage.ts sits
// deeper in the app graph than a pure lookup table:
//   - "@/..." path aliases (tsconfig `paths`), mapped to the repo root.
//   - `import "server-only"`, which throws on sight outside a React Server
//     Components build. Nothing reachable from these tests uses it — the
//     network and the image downloader are never called — so it is stubbed out.
//
// Everything here runs against saved fixtures in ./__fixtures__, never the live
// network: the whole point of the table is that publisher markup changes, and a
// test that refetches would go red for reasons unrelated to this code.
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

// Dynamic, because the hooks above have to be registered before the graph loads.
const { load } = await import("cheerio");
const { extractDetailContent, resolveDetailTextScoping, fetchDetailPage } =
  await import("./fetchDetailPage.ts");

const fixture = (name) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

const CWA_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/W29.html?T=202608291137";
const TSC_URL =
  "https://twstreetcorner.org/2026/08/29/yung-chen-yuan-and-hsiang-ming-kung/";

/** Runs the real projection over a fixture. */
const project = (name, canonicalUrl, scoping) =>
  extractDetailContent(load(fixture(name)), canonicalUrl, scoping);

/** The asset scan's two inputs, as plain arrays, for before/after comparison. */
const assetInputs = (container) => ({
  images: container
    .find("img[src]")
    .toArray()
    .map((el) => el.attribs.src),
  links: container
    .find("a[href]")
    .toArray()
    .map((el) => el.attribs.href),
});

// ---------------------------------------------------------------------------
// Host resolution
// ---------------------------------------------------------------------------

test("an unlisted host gets no rule, i.e. today's behaviour", () => {
  // Both surveyed for #89 and both left alone: mohw scopes to a clean
  // <article> and cna to a clean one too, so neither has anything to remove.
  assert.equal(
    resolveDetailTextScoping("https://www.mohw.gov.tw/cp-16-87698-1.html"),
    null,
  );
  assert.equal(
    resolveDetailTextScoping(
      "https://www.cna.com.tw/news/ahel/202608270123.aspx",
    ),
    null,
  );
});

test("a configured host matches its own subdomains too", () => {
  // The table key is the bare domain; the feed links are all on www.
  assert.deepEqual(resolveDetailTextScoping(CWA_URL), { mode: "skip" });
  assert.deepEqual(resolveDetailTextScoping("https://cwa.gov.tw/x.html"), {
    mode: "skip",
  });
  assert.equal(resolveDetailTextScoping(TSC_URL)?.mode, "without");
});

test("a host that merely ends with the same letters does not match", () => {
  // endsWith("." + key), not endsWith(key), so this must miss.
  assert.equal(resolveDetailTextScoping("https://notcwa.gov.tw/x.html"), null);
});

test("an unparseable URL falls back to the default, not a throw", () => {
  assert.equal(resolveDetailTextScoping("not a url"), null);
});

// ---------------------------------------------------------------------------
// skip — cwa.gov.tw
// ---------------------------------------------------------------------------

test("without a rule, the CWA warning page yields chrome and a bogus district", () => {
  // This is the pre-fix behaviour, pinned so the reason for the `skip` entry
  // stays legible: pretend the page is on an unlisted host and project it.
  const { detailText, scopedContainer } = project(
    "cwa-warning-w29.html",
    "https://example.invalid/W29.html",
  );

  assert.ok(
    scopedContainer,
    "the generic <main> scoping does find a container",
  );
  // The location-picker label — prose-shaped, names exactly one district, which
  // is why #65's uniqueness rule accepted it and badged the article.
  assert.match(detailText, /鄉鎮預報 - 臺北市中正區/);
  // ... and it is the ONLY district in the text, hence "unique".
  assert.equal((detailText.match(/臺北市中正區/g) ?? []).length, 1);
  // Toolbar, legend and picker, all of it from inside <main>.
  assert.match(detailText, /紅色燈號/);
  assert.match(detailText, /產品說明文件\(PDF\)/);
  assert.match(detailText, /選擇縣市/);
  // And none of the actual bulletin, which is not on the page at all.
  assert.doesNotMatch(detailText, /天氣高溫炎熱/);
});

test("fetchDetailPage skips cwa.gov.tw outright, without a request", async () => {
  // No network stub needed: `skip` short-circuits before httpGetText, so this
  // resolving at all is itself the assertion that no request was attempted.
  const result = await fetchDetailPage({
    canonicalUrl: CWA_URL,
    title: "08/29 18:12 發布高溫資訊",
  });

  assert.deepEqual(result, {
    detailHtml: null,
    detailText: null,
    assets: [],
  });
});

// ---------------------------------------------------------------------------
// without — twstreetcorner.org
// ---------------------------------------------------------------------------

test("`without` drops the widget text and keeps the prose", () => {
  const scoped = project("twstreetcorner-post.html", TSC_URL);
  const unscoped = project(
    "twstreetcorner-post.html",
    "https://example.invalid/post/",
  );

  // Pre-fix: the TTS control panel and the Jetpack widgets are in the text.
  assert.match(unscoped.detailText, /聆聽本文 測試版 ⏮ 上一段 ▶ 朗讀/);
  assert.match(unscoped.detailText, /分享到 Facebook/);
  assert.match(unscoped.detailText, /正在載入/);
  assert.match(unscoped.detailText, /相關/);

  // Post-fix: gone.
  assert.doesNotMatch(scoped.detailText, /聆聽本文/);
  assert.doesNotMatch(scoped.detailText, /朗讀/);
  assert.doesNotMatch(scoped.detailText, /分享到 Facebook/);
  assert.doesNotMatch(scoped.detailText, /正在載入/);

  // The article itself is untouched, links inside it included.
  assert.match(scoped.detailText, /少子化是近年來臺灣社會重大的課題/);
  assert.match(scoped.detailText, /袁詠蓁／國科會人文及社會科學研究發展處/);
  assert.match(scoped.detailText, /完整統計表請見附錄。/);
  // The rule removes what it names and nothing else: everything else the two
  // projections differ by is already gone in both (the entry header is a
  // <header>, which the pre-existing document-wide strip takes).
  assert.equal(
    unscoped.detailText
      .replace(/^聆聽本文.*?外部語音服務 /, "")
      .replace(/ 分享 分享到 Facebook.*$/, ""),
    scoped.detailText,
  );
});

test("`without` leaves detailHtml and the asset scan byte-identical", () => {
  // The rendered article and its images must not change — only the text
  // projection may, and it works on a clone for exactly this reason.
  const scoped = project("twstreetcorner-post.html", TSC_URL);
  const unscoped = project(
    "twstreetcorner-post.html",
    "https://example.invalid/post/",
  );

  assert.equal(scoped.detailHtml, unscoped.detailHtml);
  assert.deepEqual(
    assetInputs(scoped.scopedContainer),
    assetInputs(unscoped.scopedContainer),
  );
  // Sanity: the fixture really does carry the assets we claim are preserved.
  const { images, links } = assetInputs(scoped.scopedContainer);
  assert.ok(images.some((src) => src.endsWith("figure-1.png")));
  assert.ok(links.some((href) => href.endsWith("appendix.pdf")));
  // Including the share links, which the text no longer mentions.
  assert.ok(links.some((href) => href.includes("share=facebook")));
});

// ---------------------------------------------------------------------------
// only — no host uses this mode yet, so it is driven explicitly.
// ---------------------------------------------------------------------------

test("`only` takes the text from the allow-listed container alone", () => {
  const { detailText } = project(
    "twstreetcorner-post.html",
    "https://example.invalid/post/",
    { mode: "only", selector: "div.streetcorner-tts-content" },
  );

  assert.match(detailText, /少子化是近年來臺灣社會重大的課題/);
  assert.doesNotMatch(detailText, /聆聽本文/);
  assert.doesNotMatch(detailText, /分享到 Facebook/);
  // The entry title lives outside the allow-listed container, so it goes too.
  assert.doesNotMatch(detailText, /結婚？不結婚？大哉問！/);
});

test("an `only` selector that matches nothing degrades to the whole container", () => {
  // A publisher redesign must cost us the scoping, not the article.
  const degraded = project(
    "twstreetcorner-post.html",
    "https://example.invalid/post/",
    { mode: "only", selector: "div.this-class-no-longer-exists" },
  );
  const unscoped = project(
    "twstreetcorner-post.html",
    "https://example.invalid/post/",
  );

  assert.equal(degraded.detailText, unscoped.detailText);
  assert.match(degraded.detailText, /少子化是近年來臺灣社會重大的課題/);
});

// ---------------------------------------------------------------------------
// #89 — the four hosts the source survey measured and configured.
//
// One shared shape for all of them, because the claim is the same in each case
// and it is a claim about a real page, not about a selector: the entry removes
// the chrome the survey named, keeps the article, and leaves detailHtml and the
// asset scan byte-identical. The length assertion in assertTextOnly is the same
// signal scripts/survey-detail-page-sources.mjs prints as its SCOPING column, so
// a failure here and a `-0` there mean the same thing — the selector stopped
// matching and the projection silently degraded to the unscoped container.
// ---------------------------------------------------------------------------

const HPA_URL =
  "https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=5020&pid=20299";
const CDC_URL =
  "https://www.cdc.gov.tw/Bulletin/Detail/8eAEgrTiTtn8vAijonSNLw?typeId=9";
const FDA_URL = "http://www.fda.gov.tw/tc/newsContent.aspx?cid=3&id=31713";
const MAMACLUB_URL = "https://mamaclub.com/learn/growth-failure-260827/";
const ILADY_URL = "https://ilady.life/psk-3/";
const LIANHONGHONG_URL = "https://lianhonghong.com/read/article/33384?ref=rss";
const HEHO_URL = "https://heho.com.tw/archives/386182";
const HEHO_CALENDAR_URL = "https://heho.com.tw/archives/384563";

/** Both projections of one fixture: as configured, and as an unlisted host. */
const scopedAndUnscoped = (name, canonicalUrl) => ({
  scoped: project(name, canonicalUrl),
  unscoped: project(name, "https://example.invalid/unlisted"),
});

/**
 * The invariant every `only`/`without` entry has to keep: text only. Asserted
 * for each configured host rather than once, because the modes reach the DOM by
 * different routes — `without` mutates the clone, `only` re-roots the selection
 * — and only one of them was in use when this file was written.
 */
const assertTextOnly = ({ scoped, unscoped }) => {
  assert.equal(
    scoped.detailHtml,
    unscoped.detailHtml,
    "detailHtml must not change",
  );
  assert.deepEqual(
    assetInputs(scoped.scopedContainer ?? scoped.detailContainer),
    assetInputs(unscoped.scopedContainer ?? unscoped.detailContainer),
    "the asset scan's inputs must not change",
  );
  assert.ok(
    scoped.detailText.length < unscoped.detailText.length,
    `the entry removed nothing (${scoped.detailText.length} chars either way) — ` +
      "the selector has stopped matching and the projection degraded silently",
  );
};

// --- hpa.gov.tw — only ------------------------------------------------------

test("hpa.gov.tw falls back to <body> and takes the whole page unscoped", () => {
  // The pre-fix behaviour, pinned so the reason for the entry stays legible.
  const { detailText, scopedContainer } = project(
    "hpa-news-detail.html",
    "https://example.invalid/Detail.aspx",
  );

  assert.equal(
    scopedContainer,
    null,
    "no <article>/<main>/#maincontent, hence the <body> fallback",
  );
  assert.match(detailText, /新聞 115年 114年 113年/); // left year menu
  assert.match(detailText, /首頁/); // breadcrumb
  assert.match(detailText, /點閱次數：351/); // page counter
  assert.match(detailText, /看完本篇主題後，您的感覺如何？/); // feedback poll
  // The rail — five OTHER articles' headlines, in this article's text.
  assert.match(detailText, /您可能會喜歡/);
  assert.match(detailText, /揭穿新興菸品減害迷思/);
});

test("`only` on hpa keeps the release and drops menu, rail and poll", () => {
  const both = scopedAndUnscoped("hpa-news-detail.html", HPA_URL);

  assert.match(
    both.scoped.detailText,
    /為減輕不孕夫妻接受試管嬰兒療程的經濟負擔/,
  );
  assert.match(both.scoped.detailText, /國民健康署沈靜芬署長指出/);
  assert.doesNotMatch(both.scoped.detailText, /115年 114年/);
  assert.doesNotMatch(both.scoped.detailText, /點閱次數/);
  assert.doesNotMatch(both.scoped.detailText, /您可能會喜歡/);
  assert.doesNotMatch(both.scoped.detailText, /揭穿新興菸品減害迷思/);
  assert.doesNotMatch(both.scoped.detailText, /看完本篇主題後/);
  assertTextOnly(both);
  // Sanity: the fixture really does carry the assets claimed preserved.
  const { images, links } = assetInputs(both.scoped.detailContainer);
  assert.ok(images.some((src) => src.endsWith("File_24001.jpg")));
  assert.ok(links.some((href) => href.endsWith("File_24002.pdf")));
});

// --- cdc.gov.tw — only ------------------------------------------------------

test("cdc.gov.tw's <div id=footer> sitemap survives the footer strip", () => {
  // Why the entry exists: <footer> is removed document-wide, <div id="footer">
  // is not, and CDC's is a full sitemap appended to every press release.
  const { detailText, scopedContainer } = project(
    "cdc-bulletin-detail.html",
    "https://example.invalid/Bulletin/Detail/x",
  );

  assert.equal(scopedContainer, null);
  assert.match(detailText, /網站導覽/);
  assert.match(detailText, /關於CDC 署長簡介/);
  assert.match(detailText, /傳染病介紹/);
  assert.match(detailText, /流感新冠肺鏈疫苗/);
  assert.match(detailText, /取得短網址/); // share modal
});

test("`only` on cdc keeps headline and release, drops footer and share modal", () => {
  const both = scopedAndUnscoped("cdc-bulletin-detail.html", CDC_URL);

  assert.match(both.scoped.detailText, /高雄市新增3例本土登革熱病例/); // h2.con-title
  assert.match(
    both.scoped.detailText,
    /疾病管制署今\(27\)日公布新增3例登革熱本土病例/,
  );
  assert.match(both.scoped.detailText, /發佈日期：2026-08-27/);
  assert.doesNotMatch(both.scoped.detailText, /網站導覽/);
  assert.doesNotMatch(both.scoped.detailText, /署長簡介/);
  assert.doesNotMatch(both.scoped.detailText, /流感新冠肺鏈疫苗/);
  assert.doesNotMatch(both.scoped.detailText, /取得短網址/);
  assert.doesNotMatch(both.scoped.detailText, /回上一頁/);
  assertTextOnly(both);
  const { images, links } = assetInputs(both.scoped.detailContainer);
  assert.ok(images.some((src) => src.endsWith("dengue-figure.png")));
  assert.ok(links.some((href) => href.endsWith("dengue-guideline.pdf")));
});

// --- fda.gov.tw — without ---------------------------------------------------

test("`without` on fda drops menu, breadcrumb, skip link and rating form", () => {
  const both = scopedAndUnscoped("fda-announcement.html", FDA_URL);

  // Pre-fix: the announcement is 94 chars and the chrome outweighs it.
  assert.match(both.unscoped.detailText, /跳到主要內容區塊/);
  assert.match(both.unscoped.detailText, /目前位置：首頁/);
  assert.match(both.unscoped.detailText, /食藥闢謠專區/);
  assert.match(both.unscoped.detailText, /資訊內容對您是否有幫助/);
  assert.match(both.unscoped.detailText, /送出評分/);

  // Post-fix: gone, and the announcement plus its attachment list remain.
  assert.doesNotMatch(both.scoped.detailText, /跳到主要內容區塊/);
  assert.doesNotMatch(both.scoped.detailText, /目前位置/);
  assert.doesNotMatch(both.scoped.detailText, /食藥闢謠專區/);
  assert.doesNotMatch(both.scoped.detailText, /資訊內容對您是否有幫助/);
  assert.doesNotMatch(both.scoped.detailText, /驗證碼/);
  assert.doesNotMatch(both.scoped.detailText, /回上一頁/);
  assert.match(
    both.scoped.detailText,
    /主旨：廢止「食品中海洋生物毒素之檢驗方法/,
  );
  assert.match(both.scoped.detailText, /依據：中央法規標準法第二十一條第二款/);
  assert.match(both.scoped.detailText, /發布單位：研究檢驗組/);
  // The 檔案下載 list is the announcement's payload, and stays.
  assert.match(both.scoped.detailText, /檔案下載/);
  assert.match(both.scoped.detailText, /衛授食字第1151901380號公告/);
  assertTextOnly(both);
  const { links } = assetInputs(both.scoped.detailContainer);
  assert.equal(
    links.filter((href) => href.includes("GetFile.ashx")).length,
    2,
    "both attachment links stay visible to the asset scan",
  );
});

// --- mamaclub.com — without -------------------------------------------------

test("mamaclub's 推薦閱讀 rail puts other articles' prose in the text", () => {
  // The reason this is a `without` and not a cosmetic tidy-up: the teasers are
  // nested <article> elements carrying real sentences, so detail_text ends up
  // describing six articles instead of one.
  const { detailText } = project(
    "mamaclub-post.html",
    "https://example.invalid/learn/x/",
  );

  assert.match(detailText, /推薦閱讀/);
  assert.match(detailText, /家扶籲關注能源平權/);
  assert.match(detailText, /面對全球能源轉型與/);
  assert.match(detailText, /關於作者與本篇文章/);
  assert.match(detailText, /我要回應/);
  assert.match(detailText, /收藏文章/);
  assert.match(detailText, /發表於 2026-08-27/);
});

test("`without` on mamaclub keeps the post and drops byline, author box and rail", () => {
  const both = scopedAndUnscoped("mamaclub-post.html", MAMACLUB_URL);

  assert.match(
    both.scoped.detailText,
    /曾有一名足月出生、體重僅2200克的低體重兒/,
  );
  assert.match(
    both.scoped.detailText,
    /台北慈濟醫院遺傳醫學中心主任謝秀盈醫師/,
  );
  assert.match(both.scoped.detailText, /※本文由 照護線上 授權使用/);
  assert.doesNotMatch(both.scoped.detailText, /推薦閱讀/);
  assert.doesNotMatch(both.scoped.detailText, /家扶籲關注能源平權/);
  assert.doesNotMatch(both.scoped.detailText, /關於作者與本篇文章/);
  assert.doesNotMatch(both.scoped.detailText, /我要回應/);
  assert.doesNotMatch(both.scoped.detailText, /收藏文章/);
  assert.doesNotMatch(both.scoped.detailText, /看留言討論/);
  // The text now opens on the article, which is what imageSearchTerms and the
  // SEO summary read first.
  assert.match(both.scoped.detailText.slice(0, 40), /曾有一名足月出生/);
  assertTextOnly(both);
  // The rail's thumbnails stay visible to the asset scan even though its text
  // is gone — the two concerns are deliberately independent.
  const { images } = assetInputs(both.scoped.scopedContainer);
  assert.ok(images.some((src) => src.includes("797706-6a8fe1c602c78.jpg")));
  assert.ok(images.some((src) => src.includes("energy.jpeg")));
});

// --- ilady.life — without ---------------------------------------------------

test("`without` on ilady drops the hidden counter, the pager and the carousel", () => {
  const both = scopedAndUnscoped("ilady-post.html", ILADY_URL);

  // Pre-fix: a display:none view counter is the FIRST character of the text.
  assert.match(both.unscoped.detailText, /^3 隨著季節轉換/);
  assert.match(both.unscoped.detailText, /previous post/);
  assert.match(both.unscoped.detailText, /Related Posts/);
  assert.match(both.unscoped.detailText, /AI讓一個人也能做更多事/);

  // Post-fix: the text opens on the article's own first sentence.
  assert.match(both.scoped.detailText, /^隨著季節轉換/);
  assert.doesNotMatch(both.scoped.detailText, /previous post/);
  assert.doesNotMatch(both.scoped.detailText, /Related Posts/);
  assert.doesNotMatch(both.scoped.detailText, /AI讓一個人也能做更多事/);
  assert.doesNotMatch(both.scoped.detailText, /20 坪小宅客廳怎麼挑沙發/);
  assert.match(both.scoped.detailText, /PSK 深海美肌專家全新推出/);
  assert.match(both.scoped.detailText, /雙效賦活配方加5大關鍵成分/);
  assertTextOnly(both);
  const { images } = assetInputs(both.scoped.scopedContainer);
  assert.ok(images.some((src) => src.endsWith("psk-product.webp")));
});

// --- lianhonghong.com — without ---------------------------------------------

test("`without` on lianhonghong drops the meta grab-bag, template source included", () => {
  const both = scopedAndUnscoped("lianhonghong-article.html", LIANHONGHONG_URL);

  // Pre-fix: byline counters, related links, credits, disclaimer, author bio —
  // and Mustache source the client-side renderer never filled in.
  assert.match(both.unscoped.detailText, /by 品牌生活快訊/);
  assert.match(both.unscoped.detailText, /864/);
  assert.match(both.unscoped.detailText, /你可能想知道更多/);
  assert.match(both.unscoped.detailText, /\{\{#items\.0\}\}/);
  assert.match(both.unscoped.detailText, /執行編輯/);
  assert.match(both.unscoped.detailText, /吾思傳媒股份有限公司/);
  assert.match(both.unscoped.detailText, /收藏文章/);

  // Post-fix: all of it gone, prose intact from the prologue to the last line.
  assert.doesNotMatch(both.scoped.detailText, /by 品牌生活快訊/);
  assert.doesNotMatch(both.scoped.detailText, /你可能想知道更多/);
  assert.doesNotMatch(both.scoped.detailText, /\{\{/);
  assert.doesNotMatch(both.scoped.detailText, /執行編輯/);
  assert.doesNotMatch(both.scoped.detailText, /吾思傳媒股份有限公司/);
  assert.doesNotMatch(both.scoped.detailText, /收藏文章/);
  assert.match(
    both.scoped.detailText,
    /^瑞典女性情趣品牌 Smile Makers 正式登台/,
  );
  assert.match(both.scoped.detailText, /致力於將情趣用品轉化為女性自我照顧/);
  assert.match(both.scoped.detailText, /添加日本萃取甘草精華/);
  assertTextOnly(both);
  const { images } = assetInputs(both.scoped.scopedContainer);
  // Both the in-body figure and the author avatar stay visible to the scan.
  assert.ok(images.some((src) => src.endsWith("figure-1.jpg")));
  assert.ok(images.some((src) => src.endsWith("avatar.png")));
});

// --- heho.com.tw — deliberately NOT configured ------------------------------

test("heho.com.tw is left on the default, and the default is already clean", () => {
  // A negative result is a result. #89 opened with heho as a suspected defect;
  // the survey found the generic <article> scoping already projects nothing but
  // the article, so the honest configuration is none at all.
  assert.equal(resolveDetailTextScoping(HEHO_URL), null);

  const { detailText, scopedContainer } = project(
    "heho-article.html",
    HEHO_URL,
  );

  assert.ok(scopedContainer, "<article> is found");
  assert.match(detailText, /為減輕不孕夫妻接受試管嬰兒療程的經濟負擔/);
  assert.match(detailText, /文 \/ 黃慧玫、圖片 \/ AI生成/);
  // The entry header and the share block are a <header> and a <style>, both of
  // which the pre-existing document-wide strip already removes.
  assert.doesNotMatch(detailText, /備孕/);
  assert.doesNotMatch(detailText, /作者：/);
  assert.doesNotMatch(detailText, /social-share-box/);
  // …and the analytics dataLayer push, which is a <script>.
  assert.doesNotMatch(detailText, /heho_read_article/);
});

test("a heho 健康日曆 card really is ~18 characters of article", () => {
  // The reading that opened #89. It is not a container-selection failure: the
  // post's whole body is one sentence, and the feed carries the same sentence.
  const { detailText } = project(
    "heho-health-calendar.html",
    HEHO_CALENDAR_URL,
  );

  assert.equal(detailText, "當你開始踏上旅途，路就會自己展開");
  assert.ok(detailText.length < 20);
  assert.doesNotMatch(detailText, /健康日曆/);
});
