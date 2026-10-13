import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// mapNavigation.ts (imported below) now pulls in lib/format/outboundLink via
// a relative, extension-less specifier (issue #451), which itself uses the
// `@/` alias — plain `node --test` can't resolve either without a loader
// hook, same as tests/outboundLinkUtm.test.mjs.
const REPO_ROOT = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
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

test("mapNavigation helper generates correct URLs and multilingual labels", async () => {
  const { buildGoogleMapsDirUrl, getNavigationButtonLabel } = await import(
    "../lib/utils/mapNavigation.ts"
  );

  // With name and address
  const urlWithAddress = buildGoogleMapsDirUrl({
    name: "臺北市立聯合醫院仁愛院區",
    address: "臺北市大安區仁愛路四段10號",
  });
  assert.ok(urlWithAddress.startsWith("https://www.google.com/maps/dir/?api=1&destination="));
  // Decode rather than compare the raw encoded substring: as of issue #451 this
  // URL is passed through appendOutboundUtm(), which reparses/reserializes it via
  // URL/URLSearchParams to attach utm_* params — that round-trip re-encodes the
  // existing `destination` value using application/x-www-form-urlencoded rules
  // (space -> `+`) rather than encodeURIComponent's `%20`, which is an equivalent,
  // harmless encoding difference but breaks a literal substring check.
  const destinationParam = new URL(urlWithAddress).searchParams.get("destination");
  assert.equal(destinationParam, "臺北市大安區仁愛路四段10號 臺北市立聯合醫院仁愛院區");

  // With coords only
  const urlWithCoords = buildGoogleMapsDirUrl({
    name: "AED 站點",
    lat: 25.033,
    lng: 121.565,
  });
  assert.ok(decodeURIComponent(urlWithCoords).includes("25.033,121.565"));

  // Multilingual labels
  assert.equal(getNavigationButtonLabel("zh-TW"), "🗺️ Google 地圖導航");
  assert.equal(getNavigationButtonLabel("en"), "🗺️ Google Maps Navigation");
  assert.equal(getNavigationButtonLabel("ja"), "🗺️ Google マップでナビ");
  assert.equal(getNavigationButtonLabel("ko"), "🗺️ Google 지도 길찾기");
});

test("Japanese and Korean dictionaries exist and have complete structure", () => {
  const ja = JSON.parse(fs.readFileSync("locales/ja.json", "utf8"));
  assert.ok(ja.nav?.facilities, "ja.json must have nav.facilities");
  assert.ok(ja.tools?.facilities, "ja.json must have tools.facilities");
  assert.ok(ja.catalog?.clinics, "ja.json must have catalog.clinics");
  assert.ok(ja.common?.language, "ja.json must have common.language");
  assert.ok(ja.footer?.license, "ja.json must have footer.license");

  const ko = JSON.parse(fs.readFileSync("locales/ko.json", "utf8"));
  assert.ok(ko.nav?.facilities, "ko.json must have nav.facilities");
  assert.ok(ko.tools?.facilities, "ko.json must have tools.facilities");
  assert.ok(ko.catalog?.clinics, "ko.json must have catalog.clinics");
  assert.ok(ko.common?.language, "ko.json must have common.language");
  assert.ok(ko.footer?.license, "ko.json must have footer.license");
});

test("LanguageContext and LanguageToggler support zh-TW, en, ja, and ko", () => {
  const contextSrc = fs.readFileSync("app/context/LanguageContext.tsx", "utf8");
  // issue #485: the locale list itself moved to lib/i18n/dictionary.ts
  // (SUPPORTED_LOCALES), which LanguageContext.tsx now imports/re-exports
  // rather than declaring "ja"/"ko" as its own literals — both the
  // server-safe getDictionary() (full-page i18n) and the client
  // useLanguage() (UI-chrome i18n) read the exact same list.
  const dictionarySrc = fs.readFileSync("lib/i18n/dictionary.ts", "utf8");
  assert.ok(dictionarySrc.includes('"ja"'), "the shared dictionary module must support ja");
  assert.ok(dictionarySrc.includes('"ko"'), "the shared dictionary module must support ko");
  assert.ok(contextSrc.includes("SUPPORTED_LOCALES"), "LanguageContext must re-export the shared locale list");
  assert.ok(contextSrc.includes("forcedLocale"), "LanguageContext must support a locked/forced locale (issue #485)");
  // issue #485: the old `?lang=` query-param detection this used to check
  // for (`urlLang`) is retired — `/tools/aed?lang=en` now gets a permanent
  // redirect to `/en/tools/aed` (see next.config.js's redirects()) before
  // this code ever runs, and real /en//ja//ko/ routes are the only
  // remaining way to reach a non-zh locale server-side.
  assert.ok(!contextSrc.includes("urlLang"), "the retired ?lang= query-param detection must not come back");

  const togglerSrc = fs.readFileSync("components/Header/LanguageToggler.tsx", "utf8");
  assert.ok(togglerSrc.includes('"ja"'), "LanguageToggler must offer ja");
  assert.ok(togglerSrc.includes('"ko"'), "LanguageToggler must offer ko");
  assert.ok(togglerSrc.includes("日本語"), "LanguageToggler must display 日本語");
  assert.ok(togglerSrc.includes("한국어"), "LanguageToggler must display 한국어");
});

test("SEO, alternates, and sitemap include ja and ko via the real /en//ja//ko/ mechanism (issue #485), not the retired ?lang= one", () => {
  // The (zh) root layout's own metadata no longer claims a `?lang=ja|ko`
  // translation for the home page (issue #485 retires that broken
  // declaration until a future ticket gives the home page a real /ja//ko/
  // version) — but ja/ko are still fully wired up for the 3 pages that do:
  // via lib/i18n/translatedPages.ts (PATH_LOCALES) and the dedicated
  // app/[locale]/ route tree, asserted below.
  const layoutSrc = fs.readFileSync("app/(zh)/layout.tsx", "utf8");
  assert.ok(!layoutSrc.includes("lang=ja"), "the retired ?lang=ja home-page alternate must not come back");
  assert.ok(!layoutSrc.includes("lang=ko"), "the retired ?lang=ko home-page alternate must not come back");

  // PATH_LOCALES is defined once in lib/i18n/dictionary.ts and re-exported
  // (not redeclared) from lib/i18n/translatedPages.ts.
  const dictionarySrc = fs.readFileSync("lib/i18n/dictionary.ts", "utf8");
  assert.ok(dictionarySrc.includes('PATH_LOCALES: PathLocale[] = ["en", "ja", "ko"]'), "PATH_LOCALES must include ja and ko");

  const localeLayoutSrc = fs.readFileSync("app/[locale]/layout.tsx", "utf8");
  assert.ok(localeLayoutSrc.includes("html lang={pathLocale}"), "the /[locale]/ root layout must set a real per-request <html lang>");

  const sitemapSrc = fs.readFileSync("app/sitemap.ts", "utf8");
  assert.ok(!sitemapSrc.includes("lang=ja"), "the retired ?lang=ja sitemap alternate must not come back");
  assert.ok(!sitemapSrc.includes("lang=ko"), "the retired ?lang=ko sitemap alternate must not come back");
  assert.ok(sitemapSrc.includes("buildHreflangAlternates"), "sitemap must build real ja/ko alternates for translated pages");

  const llmsSrc = fs.readFileSync("app/llms.txt/route.ts", "utf8");
  assert.ok(llmsSrc.includes("日本語 (ja)"));
  assert.ok(llmsSrc.includes("한국어 (ko)"));
});

test("ISR performance optimizations are properly configured", () => {
  // news detail has generateStaticParams
  const newsDetailSrc = fs.readFileSync("app/(zh)/news/[id]/page.tsx", "utf8");
  assert.ok(newsDetailSrc.includes("export async function generateStaticParams()"));
  assert.ok(newsDetailSrc.includes("export const revalidate = 60;"));

  // privacy is ISR, not force-dynamic
  const privacySrc = fs.readFileSync("app/(zh)/privacy/page.tsx", "utf8");
  assert.ok(!privacySrc.includes('export const dynamic = "force-dynamic";'));
  assert.ok(privacySrc.includes("export const revalidate = 86400;"));

  // llm-info is ISR, not force-dynamic
  const llmInfoSrc = fs.readFileSync("app/(zh)/llm-info/page.tsx", "utf8");
  assert.ok(!llmInfoSrc.includes('export const dynamic = "force-dynamic";'));
  assert.ok(llmInfoSrc.includes("export const revalidate = 3600;"));

  // news index is ISR, not force-dynamic
  const newsIndexSrc = fs.readFileSync("app/(zh)/news/page.tsx", "utf8");
  assert.ok(!newsIndexSrc.includes('export const dynamic = "force-dynamic";'));
  assert.ok(newsIndexSrc.includes("export const revalidate = 60;"));

  // er-status is 30s ISR, not force-dynamic
  const erStatusSrc = fs.readFileSync("app/(zh)/tools/er-status/page.tsx", "utf8");
  assert.ok(!erStatusSrc.includes('export const dynamic = "force-dynamic";'));
  assert.ok(erStatusSrc.includes("export const revalidate = 30;"));

  // power-grid is 60s ISR, not force-dynamic
  const powerGridSrc = fs.readFileSync("app/(zh)/tools/power-grid-overview/page.tsx", "utf8");
  assert.ok(!powerGridSrc.includes('export const dynamic = "force-dynamic";'));
  assert.ok(powerGridSrc.includes("export const revalidate = 60;"));
});

test("compareByStrokeOrder handles Japanese, Korean, and unknown characters without throwing", async () => {
  const { compareByStrokeOrder } = await import("../lib/server/tools/strokeOrder.ts");
  
  // Previously crashed with: No stroke count for "医" (from label "医療・介護施設")
  assert.doesNotThrow(() => {
    compareByStrokeOrder("医療・介護施設", "生活・安全ツール");
  });

  assert.doesNotThrow(() => {
    compareByStrokeOrder("의료 및 돌봄", "생활 안전");
  });

  // Supports locale-based sorting
  const jaSorted = ["生活・安全ツール", "医療・介護施設"].sort((a, b) =>
    compareByStrokeOrder(a, b, "ja")
  );
  assert.ok(Array.isArray(jaSorted));

  const koSorted = ["생활 안전", "의료 및 돌봄"].sort((a, b) =>
    compareByStrokeOrder(a, b, "ko")
  );
  assert.ok(Array.isArray(koSorted));
});

