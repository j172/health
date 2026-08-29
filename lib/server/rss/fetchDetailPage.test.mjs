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
  assert.equal(
    resolveDetailTextScoping("https://www.mohw.gov.tw/cp-16-1.html"),
    null,
  );
  assert.equal(
    resolveDetailTextScoping("https://www.cdc.gov.tw/Bulletin/Detail/x"),
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
