import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

// Issue #746: 頁尾「公民夥伴」欄 9 個外部連結的外聯符號（↗ 對輔助科技隱藏，改以
// 視覺隱藏的「（另開新視窗）」傳達）＋ 版權列上方的 HawkHost 推薦（聯盟）連結
// （原始網址、不加 UTM、rel="sponsored nofollow noopener noreferrer"）＋ 隱私權政策說明。
//
// 這個 repo 沒有 jsdom／@testing-library，所以這裡用最小的方式「真的把頁尾渲染成 HTML」：
// 以 repo 本來就有的 typescript 把 SiteFooter.tsx 轉成 JS（Node 內建的 type stripping
// 不認得 JSX），next/link、next/image、LanguageContext 換成極簡替身，其餘（navModel、
// 字典、affiliateLinks）全部是真的程式碼；再用 react-dom/server 渲染，只斷言輸出的 HTML
// （外部行為），不檢查實作細節。不新增任何依賴。

const REPO_ROOT = new URL("../", import.meta.url);
const ROOT_DIR = fileURLToPath(REPO_ROOT);
let requireFromRepo;
try {
  requireFromRepo = createRequire(import.meta.url);
  requireFromRepo.resolve("typescript");
} catch {
  let mainRepoDir = ROOT_DIR;
  try {
    const { execSync } = await import("node:child_process");
    const commonDir = execSync("git rev-parse --git-common-dir", { encoding: "utf8" }).trim();
    mainRepoDir = path.resolve(commonDir, "..");
  } catch {}
  requireFromRepo = createRequire(path.join(mainRepoDir, "package.json"));
}
const ts = requireFromRepo("typescript");

const STUBS = {
  "next/link": `
    import { createElement } from "react";
    export default function Link({ href, children, ...rest }) {
      return createElement("a", { href, ...rest }, children);
    }`,
  "next/image": `
    import { createElement } from "react";
    export default function Image({ src, alt }) {
      return createElement("img", { src: String(src), alt });
    }`,
  "@/app/context/LanguageContext": `
    import { lookupDictionaryKey } from ${JSON.stringify(new URL("lib/i18n/dictionary.ts", REPO_ROOT).href)};
    export function useLanguage() {
      const locale = globalThis.__footerTestLocale ?? "zh-TW";
      return { locale, t: (key, defaultValue) => lookupDictionaryKey(locale, key, defaultValue) };
    }`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    if (specifier in STUBS) {
      return { url: `stub:${specifier}`, shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (parentURL?.startsWith("stub:")) {
      parentURL = new URL("tests/x.mjs", REPO_ROOT).href;
    }
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target) && !target.endsWith(".json")) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    if (specifier.startsWith("@/") && target.endsWith(".json")) {
      return nextResolve(target, { ...context, parentURL });
    }
    try {
      return nextResolve(target, { ...context, parentURL });
    } catch (err) {
      if (!target.startsWith(".") && !target.startsWith("/") && !target.startsWith("file:")) {
        const resolved = requireFromRepo.resolve(target);
                return { url: pathToFileURL(resolved).href, shortCircuit: true };
      }
      throw err;
    }
  },
  load(url, context, nextLoad) {
    if (url.startsWith("stub:")) {
      return { format: "module", source: STUBS[url.slice("stub:".length)], shortCircuit: true };
    }
    if (url.endsWith(".json")) {
      const source = fs.readFileSync(fileURLToPath(url), "utf8");
      return { format: "json", source, shortCircuit: true };
    }
    if (url.endsWith(".tsx")) {
      const source = fs.readFileSync(fileURLToPath(url), "utf8");
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      });
      return { format: "module", source: outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: SiteFooter } = await import("../components/News/SiteFooter.tsx");
const { CIVIC_PARTNER_LINKS } = await import("../lib/server/tools/navModel.ts");
const { HAWKHOST_REFERRAL_URL, AFFILIATE_LINK_REL, RECOMMENDED_AFFILIATE_LINKS } = await import(
  "../lib/constants/affiliateLinks.ts"
);
const { appendOutboundUtm } = await import("../lib/format/outboundLink.ts");
const { PRIVACY_SECTIONS, buildPrivacyLlmsPageContent } = await import(
  "../lib/server/content/privacyContent.ts"
);

const LOCALES = ["zh-TW", "en", "ja", "ko"];
const EXPECTED_HAWKHOST_URL = "https://my.hawkhost.com/aff.php?aff=18170&utm_source=j172.tw";

const readLocale = (locale) =>
  JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "locales", `${locale}.json`), "utf8"));

function renderFooter(locale) {
  globalThis.__footerTestLocale = locale;
  try {
    return renderToStaticMarkup(createElement(SiteFooter));
  } finally {
    delete globalThis.__footerTestLocale;
  }
}

/** 所有 <a …>…</a>（頁尾沒有巢狀 <a>）。 */
function anchors(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    index: m.index,
    attrs: m[1],
    inner: m[2],
    raw: m[0],
  }));
}

const hostOf = (href) => {
  try {
    return new URL(href).hostname;
  } catch {
    return null;
  }
};

const attr = (attrs, name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]?.replace(/&amp;/g, "&");

test("HawkHost 推薦網址常數：與指定網址完全相同、保留指定之 utm_source=j172.tw", () => {
  assert.equal(HAWKHOST_REFERRAL_URL, EXPECTED_HAWKHOST_URL);
  assert.match(HAWKHOST_REFERRAL_URL, /utm_source=j172\.tw/);
  assert.ok(!/utm_source=health\.j172\.tw/i.test(HAWKHOST_REFERRAL_URL));
  assert.equal(AFFILIATE_LINK_REL, "sponsored nofollow noopener noreferrer");
  // 對照組：若被 appendOutboundUtm 包裝就會被改寫/附加 health.j172.tw——這正是不可包裝的理由。
  assert.notEqual(appendOutboundUtm(HAWKHOST_REFERRAL_URL), HAWKHOST_REFERRAL_URL);
});

test("RECOMMENDED_AFFILIATE_LINKS 常數清單：5 個指定服務網址與 rel 屬性完整", () => {
  assert.equal(RECOMMENDED_AFFILIATE_LINKS.length, 5);
  assert.equal(RECOMMENDED_AFFILIATE_LINKS[0].url, EXPECTED_HAWKHOST_URL);
  assert.equal(RECOMMENDED_AFFILIATE_LINKS[1].url, "https://hahow.in/ur/j172?utm_source=j172.tw");
  assert.equal(RECOMMENDED_AFFILIATE_LINKS[2].url, "https://www.uber.com/invite/sgyal?utm_source=j172.tw");
  assert.equal(RECOMMENDED_AFFILIATE_LINKS[3].url, "https://www.klook.com/zh-TW/invite/D3ZWFN?c=TWD&utm_source=j172.tw");
  assert.equal(
    RECOMMENDED_AFFILIATE_LINKS[4].url,
    "https://invite.duolingo.com/profile-share/j172tw?via=share_profile_qr",
  );

  for (const item of RECOMMENDED_AFFILIATE_LINKS) {
    if (item.id !== "duolingo") {
      assert.match(item.url, /utm_source=j172\.tw/);
    }
    assert.ok(!/utm_source=health\.j172\.tw/i.test(item.url));
  }
});

test("SiteFooter 原始碼：推薦連結不經過 appendOutboundUtm", () => {
  const source = fs.readFileSync(path.join(ROOT_DIR, "components", "News", "SiteFooter.tsx"), "utf8");
  assert.ok(source.includes("RECOMMENDED_AFFILIATE_LINKS"));
  assert.ok(!/appendOutboundUtm\(\s*link\.url/.test(source));
  const affiliateSource = fs.readFileSync(
    path.join(ROOT_DIR, "lib", "constants", "affiliateLinks.ts"),
    "utf8",
  );
  assert.ok(!/import[^;]*outboundLink/.test(affiliateSource), "affiliateLinks.ts 不可引入 UTM 機制");
});

for (const locale of LOCALES) {
  test(`[${locale}] 公民夥伴 16 個連結皆有 aria-hidden 的 ↗ 與視覺隱藏的「另開新視窗」文字`, () => {
    const html = renderFooter(locale);
    const newWindow = readLocale(locale).footer.opensInNewWindow;
    assert.ok(newWindow && newWindow.length > 0);
    assert.equal(CIVIC_PARTNER_LINKS.length, 16);

    const all = anchors(html);
    for (const partner of CIVIC_PARTNER_LINKS) {
      const host = new URL(partner.href).hostname;
      const matches = all.filter((a) => hostOf(attr(a.attrs, "href")) === host);
      assert.equal(matches.length, 1, `${host} 應該剛好出現一次`);
      const [link] = matches;
      assert.equal(attr(link.attrs, "target"), "_blank");
      assert.ok(
        link.inner.includes('<span aria-hidden="true">↗</span>'),
        `${host} 缺少 aria-hidden 的 ↗：${link.inner}`,
      );
      assert.ok(
        link.inner.includes(`<span class="sr-only">${newWindow}</span>`),
        `${host} 缺少視覺隱藏的「${newWindow}」：${link.inner}`,
      );
      // 符號只出現一次：地區化字串本身不可再帶 ↗，否則會變成「↗ ↗」。
      assert.equal(link.inner.split("↗").length - 1, 1, `${host} 的 ↗ 應該只有一個：${link.inner}`);
      // 符號之前必須有可見的連結文字。
      const visibleLabel = link.inner.slice(0, link.inner.indexOf('<span aria-hidden="true">')).trim();
      assert.ok(visibleLabel.length > 0, `${host} 缺少可見的連結文字`);
    }

    const smcLink = all.find((a) => hostOf(attr(a.attrs, "href")) === "smc.peering.tw");
    assert.ok(smcLink, "smc.peering.tw 應出現在頁尾公民夥伴連結中");
    const expectedSmcLabel = readLocale(locale).footer.smcPeering;
    const msfLink = all.find((a) => hostOf(attr(a.attrs, "href")) === "www.msf.org.tw");
    assert.ok(msfLink, "www.msf.org.tw 應出現在頁尾公民夥伴連結中");
    const expectedMsfLabel = readLocale(locale).footer.msfTaiwan;
    assert.ok(
      msfLink.inner.includes(expectedMsfLabel),
      `www.msf.org.tw 應顯示在地化標題「${expectedMsfLabel}」，實際：${msfLink.inner}`,
    );

    const amnestyLink = all.find((a) => hostOf(attr(a.attrs, "href")) === "www.amnesty.tw");
    assert.ok(amnestyLink, "www.amnesty.tw 應出現在頁尾公民夥伴連結中");
    const expectedAmnestyLabel = readLocale(locale).footer.amnestyTaiwan;
    assert.ok(
      amnestyLink.inner.includes(expectedAmnestyLabel),
      `www.amnesty.tw 應顯示在地化標題「${expectedAmnestyLabel}」，實際：${amnestyLink.inner}`,
    );

    const aidLink = all.find((a) => hostOf(attr(a.attrs, "href")) === "www.aid.org.tw");
    assert.ok(aidLink, "www.aid.org.tw 應出現在頁尾公民夥伴連結中");
    const expectedAidLabel = readLocale(locale).footer.taiwanAid;
    assert.ok(
      aidLink.inner.includes(expectedAidLabel),
      `www.aid.org.tw 應顯示在地化標題「${expectedAidLabel}」，實際：${aidLink.inner}`,
    );

    const icdfLink = all.find((a) => hostOf(attr(a.attrs, "href")) === "www.icdf.org.tw");
    assert.ok(icdfLink, "www.icdf.org.tw 應出現在頁尾公民夥伴連結中");
    const expectedIcdfLabel = readLocale(locale).footer.icdf;
    assert.ok(
      icdfLink.inner.includes(expectedIcdfLabel),
      `www.icdf.org.tw 應顯示在地化標題「${expectedIcdfLabel}」，實際：${icdfLink.inner}`,
    );
    assert.ok(
      smcLink.inner.includes(expectedSmcLabel),
      `smc.peering.tw 應顯示在地化標題「${expectedSmcLabel}」，實際：${smcLink.inner}`,
    );
  });

  test(`[${locale}] 推薦服務連結列：5 個服務皆存在、保留指定 UTM、rel/target 正確、具外聯符號、位於版權列之前`, () => {
    const html = renderFooter(locale);
    const dict = readLocale(locale).footer;
    const all = anchors(html);

    assert.ok(html.includes(dict.recommendedServices.replace(/&/g, "&amp;")), "頁尾應包含在地化推薦服務標題");

    for (const item of RECOMMENDED_AFFILIATE_LINKS) {
      const matched = all.filter((a) => attr(a.attrs, "href") === item.url);
      assert.equal(matched.length, 1, `${item.name} 應剛好出現一次`);
      const [link] = matched;

      assert.equal(attr(link.attrs, "href"), item.url);
      assert.ok(!/utm_source=health\.j172\.tw/i.test(link.attrs), "聯盟連結不可被附加 health.j172.tw 之 UTM");
      if (item.id !== "duolingo") {
        assert.match(attr(link.attrs, "href"), /utm_source=j172\.tw/, "聯盟連結應保留指定之 j172.tw UTM 參數");
      }
      assert.equal(attr(link.attrs, "rel"), "sponsored nofollow noopener noreferrer");
      assert.equal(attr(link.attrs, "target"), "_blank");

      assert.ok(link.inner.includes(item.name), "連結文字應包含服務名稱");
      assert.ok(link.inner.includes('<span aria-hidden="true">↗</span>'));
      assert.ok(link.inner.includes(`<span class="sr-only">${dict.opensInNewWindow}</span>`));

      const copyrightIndex = html.indexOf("j172tw Healthz.");
      assert.ok(copyrightIndex > 0, "找不到版權列");
      assert.ok(link.index < copyrightIndex, `${item.name} 必須在版權列之前`);
    }

    const firstLink = all.find((a) => attr(a.attrs, "href") === RECOMMENDED_AFFILIATE_LINKS[0].url);
    const before = html.slice(0, firstLink.index);
    assert.ok(before.lastIndexOf("<p") > before.lastIndexOf("</ul>"), "推薦列不可位於任何 <ul> 清單內");
    const lastPTag = before.slice(before.lastIndexOf("<p"));
    assert.match(lastPTag, /^<p class="[^"]*font-mono[^"]*">/);
  });

  test(`[${locale}] 公民夥伴連結仍有 UTM，聯盟連結以外的外部連結不受影響`, () => {
    const html = renderFooter(locale);
    for (const partner of CIVIC_PARTNER_LINKS) {
      const host = new URL(partner.href).hostname;
      const link = anchors(html).find((a) => attr(a.attrs, "href").includes(host));
      assert.match(attr(link.attrs, "href"), /utm_source=health\.j172\.tw/);
      assert.equal(attr(link.attrs, "rel"), "noreferrer noopener");
    }
    // 「主站」與社群圖示維持原樣。
    const main = anchors(html).find((a) => attr(a.attrs, "href").startsWith("https://www.j172.tw"));
    assert.ok(main.inner.includes("↗"));
    assert.equal(attr(main.attrs, "rel"), "noreferrer noopener");
  });
}

test("HawkHost 揭露文字在 zh/en/ja/ko 都明確寫出「推薦連結」與「可能獲得回饋」", () => {
  const expectations = {
    "zh-TW": [/HawkHost/, /推薦連結/, /可能獲得回饋/],
    en: [/HawkHost/, /referral/i, /may receive a commission/i],
    ja: [/HawkHost/, /紹介リンク/, /紹介報酬を受け取る場合があります/],
    ko: [/HawkHost/, /추천 링크/, /수수료를 받을 수 있습니다/],
  };
  for (const locale of LOCALES) {
    const text = readLocale(locale).footer.hostingReferral;
    for (const pattern of expectations[locale]) {
      assert.match(text, pattern, `${locale}: footer.hostingReferral 應符合 ${pattern}`);
    }
  }
});

test("locales：footer.opensInNewWindow／hostingReferral 在四個語系都存在，且 10 個公民夥伴標籤不再自帶 ↗", () => {
  const labelKeys = [
    "g0v",
    "kumaAcademy",
    "antiCognitiveWarfare",
    "taiwanCriminals",
    "sportsCoach",
    "mohwVio",
    "moeEce",
    "sfaaCrc",
    "council2026",
    "smcPeering",
    "msfTaiwan",
    "amnestyTaiwan",
    "taiwanAid",
    "icdf",
  ];
  for (const locale of LOCALES) {
    const footer = readLocale(locale).footer;
    for (const key of ["opensInNewWindow", "hostingReferral", "recommendedServices"]) {
      assert.equal(typeof footer[key], "string", `${locale}.json 缺少 footer.${key}`);
      assert.ok(footer[key].trim().length > 0);
    }
    for (const key of labelKeys) {
      assert.ok(!footer[key].includes("↗"), `${locale}.json footer.${key} 不應再自帶 ↗（改由元件繪製）`);
    }
  }
});

test("隱私權政策：說明頁尾 HawkHost 推薦連結可能由 HawkHost 設定追蹤 Cookie（頁面與 llms.txt／markdown 同源）", () => {
  const texts = PRIVACY_SECTIONS.flatMap((section) => [
    ...(section.paragraphs ?? []),
    ...(section.items ?? []).map((item) => `${item.label ?? ""}${item.body}`),
  ]);
  const matched = texts.filter((text) => text.includes("HawkHost"));
  assert.equal(matched.length, 1, "隱私權政策應剛好有一則 HawkHost 說明");
  assert.match(matched[0], /推薦（聯盟）連結/);
  assert.match(matched[0], /追蹤 Cookie/);

  const llms = buildPrivacyLlmsPageContent("https://health.j172.tw");
  const llmsText = llms.sections.flatMap((s) => s.paragraphs).join("\n");
  assert.ok(llmsText.includes("HawkHost"));
});
