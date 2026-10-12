import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Issue #460: Navbar collapses from 11 top-level items down to exactly 5
// (新聞｜工具▾｜生活情境▾｜我附近｜🚨緊急) at >=1024px, with "工具" expanding
// into a mega menu driven by issue #443's `buildNavModel()`
// (lib/server/tools/navModel.ts). SiteNav.tsx is a "use client" component
// whose module body contains real JSX, so — matching every other test that
// touches a component in this repo (see footerLinks.test.mjs,
// tools-long-term-care-merge-484.test.mjs) — these assertions inspect its
// source text directly rather than importing/rendering it; this repo has no
// JSX/DOM render harness.

const ROOT_DIR = process.cwd();

function read(...parts) {
  return fs.readFileSync(path.join(ROOT_DIR, ...parts), "utf-8");
}

const navContent = read("components", "News", "SiteNav.tsx");

// ---------------------------------------------------------------------------
// Wiring: SiteNav must call the real buildNavModel(), not reinvent grouping
// ---------------------------------------------------------------------------

test("SiteNav.tsx imports buildNavModel and GUIDES from lib/server/tools/navModel, not catalog.ts directly", () => {
  assert.match(
    navContent,
    /import\s*\{\s*buildNavModel\s*,\s*GUIDES\s*,?[^}]*\}\s*from\s*"@\/lib\/server\/tools\/navModel"/,
    "SiteNav.tsx must import buildNavModel/GUIDES from navModel.ts",
  );
  assert.ok(
    !/from\s*"@\/lib\/server\/tools\/catalog"/.test(navContent),
    "SiteNav.tsx should derive categories via buildNavModel(), not re-import TOOL_CATALOG/TOOL_GROUP_META directly",
  );
});

test("SiteNav.tsx actually calls buildNavModel() with translate hooks wired to useLanguage()'s t()/locale", () => {
  assert.match(navContent, /buildNavModel\(\{/, "SiteNav.tsx must call buildNavModel({ ... })");
  assert.match(
    navContent,
    /translateGroupLabel:\s*\(meta\)\s*=>\s*t\(meta\.labelKey,\s*meta\.labelDefault\)/,
    "translateGroupLabel must be wired through the existing t(meta.labelKey, meta.labelDefault) pattern",
  );
  assert.match(
    navContent,
    /translateToolLabel:/,
    "translateToolLabel option must be passed",
  );
  assert.match(
    navContent,
    /locale !== "zh-TW"\s*\?\s*t\(`catalog\.\$\{tool\.slug\}`,\s*zhLabel\)\s*:\s*zhLabel/,
    "tool label translation must follow the established locale !== 'zh-TW' ? t(`catalog.${slug}`, zhLabel) : zhLabel convention",
  );
});

test("SiteNav.tsx resolves guide links from navModel.ts's GUIDES, pointing at /guides/[slug]", () => {
  assert.match(
    navContent,
    /GUIDES\.map\(\s*\(guide\)\s*=>\s*\(\{\s*href:\s*`\/guides\/\$\{guide\.slug\}`/,
    "guideLinks must be derived from GUIDES with href `/guides/${guide.slug}`",
  );
});

// ---------------------------------------------------------------------------
// Exactly 5 top-level desktop items, "首頁" removed
// ---------------------------------------------------------------------------

function extractBetween(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  assert.ok(start !== -1, `marker not found: ${startMarker}`);
  const end = content.indexOf(endMarker, start);
  assert.ok(end !== -1, `end marker not found after start: ${endMarker}`);
  return content.slice(start, end);
}

const desktopNavBlock = extractBetween(
  navContent,
  'aria-label="主要導覽"',
  "{/* Right Actions",
);

test("desktop nav (aria-label=\"主要導覽\") contains exactly the 5 required top-level entries", () => {
  assert.match(desktopNavBlock, /href="\/news"/, "新聞 must link to /news");
  assert.match(desktopNavBlock, /<ToolsMegaMenu/, "工具 must render the ToolsMegaMenu component");
  assert.match(
    desktopNavBlock,
    /<NavDropdown\s+label=\{t\("nav\.guides"/,
    "生活情境 must render a NavDropdown labeled via t(\"nav.guides\", ...)",
  );
  assert.match(desktopNavBlock, /href="\/nearby"/, "我附近 must link to /nearby");
  assert.match(
    desktopNavBlock,
    /href="\/tools\/emergency-hotlines"/,
    "🚨緊急 must still link to /tools/emergency-hotlines, unchanged",
  );
});

test('"首頁" is not a standalone top-level link inside the desktop nav (logo links to "/" instead)', () => {
  assert.ok(
    !/nav\.home/.test(desktopNavBlock),
    "the desktop nav block must not render a separate 首頁/nav.home link",
  );
  assert.ok(
    !/<Link\s+href="\/"/.test(desktopNavBlock),
    "the desktop nav block itself must not contain a bare href=\"/\" link (only the logo, outside this block, should link home)",
  );
});

test("the logo links to \"/\" (serves as the removed 首頁 entry)", () => {
  const logoBlock = navContent.slice(0, navContent.indexOf('aria-label="主要導覽"'));
  assert.match(logoBlock, /<Link href="\/" className="flex items-center gap-2\.5">/);
});

// ---------------------------------------------------------------------------
// Desktop breakpoint is >=1024px (Tailwind's unmodified `lg:`), not `xl:`
// ---------------------------------------------------------------------------

test("desktop nav shows at lg: (1024px) and the hamburger/drawer are lg:hidden, not xl:", () => {
  assert.match(
    navContent,
    /className="hidden items-center gap-1\.5 lg:flex"/,
    "desktop <nav> must unfold at lg: (>=1024px) per issue #460",
  );
  const hamburgerAndDrawer = navContent.match(/lg:hidden/g) || [];
  assert.ok(
    hamburgerAndDrawer.length >= 2,
    "both the hamburger button and the mobile drawer must be lg:hidden",
  );
  assert.ok(
    !/xl:flex/.test(navContent) && !/xl:hidden/.test(navContent),
    "no remaining xl: breakpoint should gate the desktop nav/hamburger (old 1280px threshold)",
  );
});

// ---------------------------------------------------------------------------
// Mega menu: live filter + ARIA structure (Disclosure Navigation pattern)
// ---------------------------------------------------------------------------

const megaMenuSrc = extractBetween(
  navContent,
  "const ToolsMegaMenu = (",
  "export default function SiteNav()",
);

test("ToolsMegaMenu trigger has aria-expanded/aria-haspopup/aria-controls and the panel is a live-filterable landmark", () => {
  assert.match(megaMenuSrc, /aria-expanded=\{open\}/);
  assert.match(megaMenuSrc, /aria-haspopup="true"/);
  assert.match(megaMenuSrc, /aria-controls=\{panelId\}/);
  assert.match(megaMenuSrc, /id=\{panelId\}/);
});

test("ToolsMegaMenu has a client-side live-filter text input with no network call", () => {
  assert.match(megaMenuSrc, /type="search"/);
  assert.match(megaMenuSrc, /onChange=\{\(event\)\s*=>\s*setQuery\(event\.target\.value\)\}/);
  assert.ok(!/fetch\(/.test(megaMenuSrc), "the mega menu filter must not make a network call");
  assert.match(megaMenuSrc, /useMemo/, "the filtered list must be derived client-side via useMemo");
});

test("ToolsMegaMenu panel uses a <nav> landmark with per-category <h3> headings, not role=\"menu\"/menuitem", () => {
  assert.match(megaMenuSrc, /<nav\s*$|<nav\s+ref=\{linksNavRef\}/m);
  assert.match(megaMenuSrc, /aria-label=\{triggerLabel\}/);
  assert.match(megaMenuSrc, /<h3 className="mb-1\.5[^>]*>/);
  assert.ok(
    !/role="menu"/.test(megaMenuSrc) && !/role="menuitem"/.test(megaMenuSrc),
    "the mega menu panel should be a navigation region with headings, not an application menu widget",
  );
});

test("ToolsMegaMenu supports Escape-to-close, outside-click-to-close, and ArrowDown/Up/Home/End roving focus", () => {
  assert.match(megaMenuSrc, /useDisclosure\(\{/);
  assert.match(megaMenuSrc, /handleMenuArrowKeys\(event, linksNavRef, "a\[href\]"\)/);
});

test('useDisclosure (shared by both menus) handles Escape, outside mousedown, and returns focus to the trigger', () => {
  const hookSrc = extractBetween(navContent, "function useDisclosure(", "function handleMenuArrowKeys(");
  assert.match(hookSrc, /event\.key === "Escape"/);
  assert.match(hookSrc, /document\.addEventListener\("mousedown"/);
  assert.match(hookSrc, /triggerRef\.current\?\.focus\(\)/);
});

test("the mega menu deliberately does NOT import useModalA11y (a modal focus trap, wrong model for a non-modal disclosure)", () => {
  // SiteNav.tsx's doc comment explains this decision by name (see
  // useDisclosure's JSDoc above), so this checks the absence of an actual
  // import/usage, not the bare substring "useModalA11y".
  assert.ok(
    !/from\s*"@\/components\/ui\/useModalA11y"/.test(navContent),
    "SiteNav.tsx should not import useModalA11y for the mega menu or the guides dropdown",
  );
  assert.ok(
    !/useModalA11y\(/.test(navContent),
    "SiteNav.tsx should not call useModalA11y(...) anywhere",
  );
});

// ---------------------------------------------------------------------------
// Mobile drawer: left alone functionally, bonus-reuses the same nav model
// ---------------------------------------------------------------------------

test("mobile drawer reuses navModel/guideLinks instead of a second hand-rolled category list", () => {
  const drawerBlock = navContent.slice(navContent.indexOf("{mobileOpen && ("));
  assert.match(drawerBlock, /navModel\.map\(\(category\)/);
  assert.match(drawerBlock, /guideLinks\.map\(\(item\)/);
  assert.match(drawerBlock, /href="\/tools\/emergency-hotlines"/, "emergency quick-dial stays pinned in the mobile drawer");
});

// ---------------------------------------------------------------------------
// SiteFooter.tsx must not import from SiteNav.tsx (independent components)
// ---------------------------------------------------------------------------

test("SiteFooter.tsx does not import from SiteNav.tsx (independent components, each wired to navModel.ts on its own)", () => {
  // Issue #460 left SiteFooter.tsx untouched; issue #461 (merged separately,
  // after this ticket's branch point) legitimately wired SiteFooter.tsx to
  // buildFooterModel() from the same lib/server/tools/navModel.ts this
  // ticket's ToolsMegaMenu/NavDropdown consume via buildNavModel()/GUIDES —
  // both components sharing that one data source is correct and expected,
  // so this test only guards that neither component imports the other.
  const footerContent = read("components", "News", "SiteFooter.tsx");
  assert.ok(
    !/from\s*"@\/components\/News\/SiteNav"/.test(footerContent),
    "SiteFooter.tsx should not import SiteNav.tsx",
  );
});

// ---------------------------------------------------------------------------
// i18n: new nav/guides keys resolve in all 4 shipped locales
// ---------------------------------------------------------------------------

const LOCALES = ["zh-TW", "en", "ja", "ko"];
const GUIDE_SLUGS = [
  "caring-for-elders",
  "pregnancy-to-parenting",
  "typhoon-earthquake",
  "disability-living",
  "travel-health",
];

test("every locale file defines the new nav.guides/nav.nearby/nav.toolsFilter* keys", () => {
  for (const locale of LOCALES) {
    const dict = JSON.parse(read("locales", `${locale}.json`));
    for (const key of [
      "guides",
      "nearby",
      "toolsFilterPlaceholder",
      "toolsFilterLabel",
      "toolsFilterNoResults",
    ]) {
      assert.ok(
        typeof dict.nav?.[key] === "string" && dict.nav[key].length > 0,
        `locales/${locale}.json is missing a non-empty nav.${key}`,
      );
    }
    assert.ok(
      dict.nav.toolsFilterNoResults.includes("{query}"),
      `locales/${locale}.json's nav.toolsFilterNoResults must contain a {query} placeholder`,
    );
  }
});

test("every locale file defines a guides.<slug>.title for all 5 GUIDES", () => {
  for (const locale of LOCALES) {
    const dict = JSON.parse(read("locales", `${locale}.json`));
    for (const slug of GUIDE_SLUGS) {
      const title = dict.guides?.[slug]?.title;
      assert.ok(
        typeof title === "string" && title.trim().length > 0,
        `locales/${locale}.json is missing guides.${slug}.title`,
      );
    }
  }
});
