import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("A11y: app/layout.tsx declares zh-Hant-TW and mounts SkipToContent + #main-content", () => {
  const layoutPath = path.join(process.cwd(), "app", "layout.tsx");
  assert.ok(fs.existsSync(layoutPath), "app/layout.tsx must exist");

  const content = fs.readFileSync(layoutPath, "utf-8");
  assert.ok(
    content.includes('lang="zh-Hant-TW"'),
    "app/layout.tsx must specify lang='zh-Hant-TW' for screen readers",
  );
  assert.ok(
    content.includes("SkipToContent"),
    "app/layout.tsx must import and render SkipToContent",
  );
  assert.ok(
    content.includes('id="main-content"'),
    "app/layout.tsx must provide #main-content anchor target for skip link",
  );
  assert.ok(
    content.includes("tabIndex={-1}"),
    "#main-content must have tabIndex={-1} for programmatic focus on navigation",
  );
});

test("A11y: components/Accessibility/SkipToContent.tsx conforms to Taiwan moda & WCAG 2.1 AA", () => {
  const compPath = path.join(
    process.cwd(),
    "components",
    "Accessibility",
    "SkipToContent.tsx",
  );
  assert.ok(fs.existsSync(compPath), "SkipToContent.tsx must exist");

  const content = fs.readFileSync(compPath, "utf-8");
  assert.ok(
    content.includes("focus-within:not-sr-only"),
    "SkipToContent must remain hidden until keyboard focus",
  );
  assert.ok(
    content.includes('href="#main-content"') && content.includes('accessKey="C"'),
    "SkipToContent must support Alt+C (main content)",
  );
  assert.ok(
    content.includes('href="#header-nav"') && content.includes('accessKey="U"'),
    "SkipToContent must support Alt+U (header nav)",
  );
  assert.ok(
    content.includes('href="#footer-info"') && content.includes('accessKey="Z"'),
    "SkipToContent must support Alt+Z (footer info)",
  );
  assert.ok(
    content.includes('href="/accessibility"'),
    "SkipToContent must link directly to accessibility statement",
  );
  assert.ok(
    content.includes(":::"),
    "SkipToContent must include Taiwan standard anchor symbol :::",
  );
});

test("A11y: SiteNav.tsx and SiteFooter.tsx provide semantic landmarks and AccessKey anchors", () => {
  const navPath = path.join(process.cwd(), "components", "News", "SiteNav.tsx");
  const navContent = fs.readFileSync(navPath, "utf-8");
  assert.ok(
    navContent.includes('id="header-nav"') && navContent.includes('role="banner"'),
    "SiteNav must have id='header-nav' and role='banner'",
  );
  assert.ok(
    navContent.includes('accessKey="U"'),
    "SiteNav must have accessKey='U' anchor point",
  );
  assert.ok(
    navContent.includes('id="search-trigger"') && navContent.includes('accessKey="S"'),
    "SiteNav must have accessKey='S' on search trigger button",
  );

  const footerPath = path.join(process.cwd(), "components", "News", "SiteFooter.tsx");
  const footerContent = fs.readFileSync(footerPath, "utf-8");
  assert.ok(
    footerContent.includes('id="footer-info"'),
    "SiteFooter must have id='footer-info'",
  );
  assert.ok(
    footerContent.includes('accessKey="Z"'),
    "SiteFooter must have accessKey='Z' anchor point",
  );
  assert.ok(
    footerContent.includes('href: "/accessibility"'),
    "SiteFooter overview links must include /accessibility link",
  );
});

test("A11y: app/accessibility/page.tsx provides full statement and shortcuts table", () => {
  const pagePath = path.join(process.cwd(), "app", "accessibility", "page.tsx");
  assert.ok(fs.existsSync(pagePath), "app/accessibility/page.tsx must exist");

  const content = fs.readFileSync(pagePath, "utf-8");
  assert.ok(
    content.includes("WCAG 2.1 AA") && content.includes("無障礙網頁開發規範 2.1"),
    "Accessibility statement must reference both WCAG 2.1 AA and Taiwan moda 2.1",
  );
  assert.ok(
    content.includes("Alt + C") && content.includes("Alt + U") && content.includes("Alt + Z"),
    "Accessibility statement must document standard Taiwan access keys",
  );
  assert.ok(
    content.includes("github.com/j172/health/issues"),
    "Accessibility statement must provide GitHub issue reporting link",
  );
  assert.ok(
    content.includes("contact@j172.tw"),
    "Accessibility statement must provide barrier reporting contact email",
  );
});

test("A11y: app/globals.css configures visible high-contrast focus rings", () => {
  const cssPath = path.join(process.cwd(), "app", "globals.css");
  const content = fs.readFileSync(cssPath, "utf-8");
  assert.ok(
    content.includes(":focus-visible"),
    "globals.css must configure :focus-visible for keyboard accessibility (WCAG 2.4.7)",
  );
});

test("A11y: Core map components provide skip-map button and ARIA live regions", () => {
  const contraceptionPath = path.join(
    process.cwd(),
    "components",
    "ContraceptionMap",
    "ContraceptionMapContent.tsx",
  );
  const contraceptionContent = fs.readFileSync(contraceptionPath, "utf-8");
  assert.ok(
    contraceptionContent.includes('aria-live="polite"'),
    "Contraception map must announce filter counts with aria-live='polite'",
  );
  assert.ok(
    contraceptionContent.includes("跳過地圖"),
    "Contraception map must provide a keyboard skip-map button",
  );

  const breastfeedingPath = path.join(
    process.cwd(),
    "components",
    "BreastfeedingRooms",
    "BreastfeedingMapContent.tsx",
  );
  const breastfeedingContent = fs.readFileSync(breastfeedingPath, "utf-8");
  assert.ok(
    breastfeedingContent.includes('aria-live="polite"'),
    "Breastfeeding map must announce filter counts with aria-live='polite'",
  );
  assert.ok(
    breastfeedingContent.includes("跳過地圖"),
    "Breastfeeding map must provide a keyboard skip-map button",
  );
});

test("A11y: Locales dictionaries include accessibility translation keys", () => {
  const locales = ["zh-TW", "en", "ja", "ko"];
  for (const locale of locales) {
    const locPath = path.join(process.cwd(), "locales", `${locale}.json`);
    assert.ok(fs.existsSync(locPath), `locales/${locale}.json must exist`);
    const locData = JSON.parse(fs.readFileSync(locPath, "utf-8"));
    assert.ok(locData.a11y, `locales/${locale}.json must have 'a11y' section`);
    assert.ok(
      locData.footer?.accessibility || locData.a11y?.accessibility,
      `locales/${locale}.json must define accessibility label`,
    );
  }
});
