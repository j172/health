import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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
  assert.ok(urlWithAddress.includes(encodeURIComponent("臺北市大安區仁愛路四段10號 臺北市立聯合醫院仁愛院區")));

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
  assert.ok(contextSrc.includes('"ja"'), "LanguageContext must support ja");
  assert.ok(contextSrc.includes('"ko"'), "LanguageContext must support ko");
  assert.ok(contextSrc.includes("urlLang"), "LanguageContext must check URL query lang param");

  const togglerSrc = fs.readFileSync("components/Header/LanguageToggler.tsx", "utf8");
  assert.ok(togglerSrc.includes('"ja"'), "LanguageToggler must offer ja");
  assert.ok(togglerSrc.includes('"ko"'), "LanguageToggler must offer ko");
  assert.ok(togglerSrc.includes("日本語"), "LanguageToggler must display 日本語");
  assert.ok(togglerSrc.includes("한국어"), "LanguageToggler must display 한국어");
});

test("SEO, alternates, and sitemap include ja and ko", () => {
  const layoutSrc = fs.readFileSync("app/layout.tsx", "utf8");
  assert.ok(layoutSrc.includes("lang=ja"));
  assert.ok(layoutSrc.includes("lang=ko"));
  assert.ok(layoutSrc.includes('"ja_JP"'));
  assert.ok(layoutSrc.includes('"ko_KR"'));

  const sitemapSrc = fs.readFileSync("app/sitemap.ts", "utf8");
  assert.ok(sitemapSrc.includes("lang=ja"));
  assert.ok(sitemapSrc.includes("lang=ko"));

  const llmsSrc = fs.readFileSync("app/llms.txt/route.ts", "utf8");
  assert.ok(llmsSrc.includes("日本語 (ja)"));
  assert.ok(llmsSrc.includes("한국어 (ko)"));
});

test("ISR performance optimizations are properly configured", () => {
  // news detail has generateStaticParams
  const newsDetailSrc = fs.readFileSync("app/news/[id]/page.tsx", "utf8");
  assert.ok(newsDetailSrc.includes("export async function generateStaticParams()"));
  assert.ok(newsDetailSrc.includes("export const revalidate = 60;"));

  // privacy is ISR, not force-dynamic
  const privacySrc = fs.readFileSync("app/privacy/page.tsx", "utf8");
  assert.ok(!privacySrc.includes('export const dynamic = "force-dynamic";'));
  assert.ok(privacySrc.includes("export const revalidate = 86400;"));

  // llm-info is ISR, not force-dynamic
  const llmInfoSrc = fs.readFileSync("app/llm-info/page.tsx", "utf8");
  assert.ok(!llmInfoSrc.includes('export const dynamic = "force-dynamic";'));
  assert.ok(llmInfoSrc.includes("export const revalidate = 3600;"));

  // news index is ISR, not force-dynamic
  const newsIndexSrc = fs.readFileSync("app/news/page.tsx", "utf8");
  assert.ok(!newsIndexSrc.includes('export const dynamic = "force-dynamic";'));
  assert.ok(newsIndexSrc.includes("export const revalidate = 60;"));

  // er-status is 30s ISR, not force-dynamic
  const erStatusSrc = fs.readFileSync("app/tools/er-status/page.tsx", "utf8");
  assert.ok(!erStatusSrc.includes('export const dynamic = "force-dynamic";'));
  assert.ok(erStatusSrc.includes("export const revalidate = 30;"));

  // power-grid is 60s ISR, not force-dynamic
  const powerGridSrc = fs.readFileSync("app/tools/power-grid-overview/page.tsx", "utf8");
  assert.ok(!powerGridSrc.includes('export const dynamic = "force-dynamic";'));
  assert.ok(powerGridSrc.includes("export const revalidate = 60;"));
});
