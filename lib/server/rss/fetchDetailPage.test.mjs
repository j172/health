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
  assert.equal(
    resolveDetailTextScoping(
      "https://www.femh.org.tw/research/news_detail.aspx?NewsNo=16679",
    )?.mode,
    "only",
  );
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
// #89 — the hosts the source survey measured and configured.
//
// One shared shape for all of them, because the claim is the same in each case
// and it is a claim about a real page, not about a selector: the entry removes
// the chrome the survey named, keeps the article, and leaves detailHtml and the
// asset scan byte-identical. The length assertion in assertTextOnly is the same
// signal scripts/survey-detail-page-sources.mjs prints as its SCOPING column, so
// a failure here and a `-0` there mean the same thing — the selector stopped
// matching and the projection silently degraded to the unscoped container.
//
// The four non-gov entries this section originally covered (mamaclub.com,
// twstreetcorner.org, ilady.life, lianhonghong.com) were removed for #353:
// PR #329 made isGovSource() gate detail-page fetching to gov sources only, so
// fetchDetailPage() is never called for these four media hosts any more and
// their scoping rules — and these tests — were dead code.
// ---------------------------------------------------------------------------

const HPA_URL =
  "https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=5020&pid=20299";
const CDC_URL =
  "https://www.cdc.gov.tw/Bulletin/Detail/8eAEgrTiTtn8vAijonSNLw?typeId=9";
const FDA_URL = "http://www.fda.gov.tw/tc/newsContent.aspx?cid=3&id=31713";
const FEMH_URL =
  "https://www.femh.org.tw/research/news_detail.aspx?NewsNo=16679&Class=1";
const MOE_FAMILYEDU_URL =
  "https://familyedu.moe.gov.tw/docDetail.aspx?uid=28&pid=27&docid=308942";
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

// --- femh.org.tw — only ------------------------------------------------------

test("femh.org.tw falls back to <body> and takes the sidebar/tabs unscoped", () => {
  // The pre-fix behaviour (this source hardcoded detailHtml/detailText to
  // null in fetchFemhResearchNews.ts; #353 makes it fetch the detail page).
  const { detailText, scopedContainer } = project(
    "femh-news-detail.html",
    "https://example.invalid/news_detail.aspx",
  );

  assert.equal(
    scopedContainer,
    null,
    "no <article>/<main>/#maincontent, hence the <body> fallback",
  );
  assert.match(detailText, /亞東訊息 院務消息 衛教園地/); // sidebar nav
  assert.match(detailText, /最新消息 醫療新聞 活動資訊/); // tab strip
  assert.match(detailText, /理財周刊 顏瓊真/); // ul.top byline
});

test("`only` on femh keeps the release and drops the sidebar and tab strip", () => {
  const both = scopedAndUnscoped("femh-news-detail.html", FEMH_URL);

  assert.match(both.scoped.detailText, /中秋團圓可以享受美食/);
  assert.match(both.scoped.detailText, /亞東醫院營養科營養師施淑梅/);
  assert.match(both.scoped.detailText, /原文連結：請點我/);
  assert.doesNotMatch(both.scoped.detailText, /衛教園地/);
  assert.doesNotMatch(both.scoped.detailText, /徵才訊息/);
  assert.doesNotMatch(both.scoped.detailText, /理財周刊 顏瓊真/);
  assert.doesNotMatch(both.scoped.detailText, /活動資訊/);
  assertTextOnly(both);
});

// --- familyedu.moe.gov.tw — only ---------------------------------------------

test("familyedu.moe.gov.tw falls back to <body> and takes the county menu unscoped", () => {
  // The pre-fix behaviour (this source hardcoded detailHtml/detailText to
  // null in parseMoeFamilyEduHtml; #353 makes it fetch the detail page).
  const { detailText, scopedContainer } = project(
    "moe-familyedu-detail.html",
    "https://example.invalid/docDetail.aspx",
  );

  assert.equal(
    scopedContainer,
    null,
    "no <article>/<main>/#maincontent, hence the <body> fallback",
  );
  // The #65 failure shape: a sitemap plus every listed county's name.
  assert.match(detailText, /臺北市政府教育局/);
  assert.match(detailText, /新北市政府教育局/);
  assert.match(detailText, /高雄市政府教育局/);
  assert.match(detailText, /常見問答常見問答性平專區/);
});

test("`only` on familyedu keeps the announcement and drops the county menu", () => {
  const both = scopedAndUnscoped("moe-familyedu-detail.html", MOE_FAMILYEDU_URL);

  assert.match(both.scoped.detailText, /家長是孩子接觸網路的第一道守門人/);
  assert.match(both.scoped.detailText, /近6成國小生已經擁有智慧型手機了/);
  assert.doesNotMatch(both.scoped.detailText, /臺北市政府教育局/);
  assert.doesNotMatch(both.scoped.detailText, /新北市政府教育局/);
  assert.doesNotMatch(both.scoped.detailText, /常見問答常見問答性平專區/);
  assert.doesNotMatch(both.scoped.detailText, /相關檔案/);
  assert.doesNotMatch(both.scoped.detailText, /回列表頁/);
  assertTextOnly(both);
  // The attachment link sits outside div.page-article, but the asset scan
  // reads the unmodified detailContainer (body), same as every `only`/
  // `without` host above — `only` restricts detailText alone.
  const { links } = assetInputs(both.scoped.detailContainer);
  assert.ok(links.some((href) => href.includes("fileRename.aspx")));
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
