import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Issue #473 ("手機底部固定導覽列"): a fixed 5-item bottom nav bar for mobile
// (<1024px), additional to (not a replacement for) the hamburger drawer
// #460 left in place. SiteNav.tsx is a "use client" component with real
// JSX in its module body, so — matching tests/navbar-mega-menu-460.test.mjs
// and every other test touching a component in this repo — these
// assertions inspect its source text directly; there is no JSX/DOM render
// harness here.

const ROOT_DIR = process.cwd();

function read(...parts) {
  return fs.readFileSync(path.join(ROOT_DIR, ...parts), "utf-8");
}

const navContent = read("components", "News", "SiteNav.tsx");

function extractBetween(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  assert.ok(start !== -1, `marker not found: ${startMarker}`);
  const end = content.indexOf(endMarker, start);
  assert.ok(end !== -1, `end marker not found after start: ${endMarker}`);
  return content.slice(start, end);
}

const bottomNavBlock = extractBetween(
  navContent,
  'aria-label="底部導覽"',
  "{/* Modal Search */}",
);

// ---------------------------------------------------------------------------
// Exactly 5 items, correct destinations
// ---------------------------------------------------------------------------

test('SiteNav.tsx defines a bottomNavItems list with exactly the 5 required items', () => {
  const itemsSrc = extractBetween(
    navContent,
    "const bottomNavItems:",
    "return (",
  );
  assert.match(itemsSrc, /href:\s*"\/"/, "首頁 must link to /");
  assert.match(itemsSrc, /href:\s*"\/tools"/, "工具 must link to /tools");
  assert.match(itemsSrc, /href:\s*"\/nearby"/, "我附近 must link to /nearby (same forward-reference as desktop nav)");
  assert.match(
    itemsSrc,
    /href:\s*"\/tools\/emergency-hotlines"/,
    "緊急 must link to /tools/emergency-hotlines, same destination as desktop nav",
  );
  assert.match(
    itemsSrc,
    /type:\s*"button"[\s\S]*?onClick:\s*\(\)\s*=>\s*setSearchOpen\(true\)/,
    "搜尋 must reuse the existing setSearchOpen state, not a second search-modal-opening mechanism",
  );
});

test("the bottom nav bar itself renders exactly 5 entries (one grid of bottomNavItems)", () => {
  assert.match(bottomNavBlock, /grid-cols-5/, "bottom bar must lay out exactly 5 columns");
  assert.match(bottomNavBlock, /bottomNavItems\.map/, "bottom bar must render bottomNavItems");
});

// ---------------------------------------------------------------------------
// Visible only below the desktop breakpoint (<1024px, matching #460's lg:)
// ---------------------------------------------------------------------------

test("the bottom nav bar is lg:hidden and fixed to the bottom of the viewport", () => {
  assert.match(bottomNavBlock, /lg:hidden/, "bottom bar must hide at >=1024px, matching #460's breakpoint");
  assert.match(bottomNavBlock, /fixed inset-x-0 bottom-0/, "bottom bar must be fixed to the bottom edge");
});

// ---------------------------------------------------------------------------
// Safe-area / system gesture inset
// ---------------------------------------------------------------------------

test("the bottom nav bar applies the pb-safe utility (env(safe-area-inset-bottom)), not a fixed pixel value", () => {
  assert.match(bottomNavBlock, /pb-safe/, "bottom bar must use the pb-safe utility for its bottom inset");
});

test("app/globals.css defines pb-safe via env(safe-area-inset-bottom)", () => {
  const globalsCss = read("app", "globals.css");
  assert.match(
    globalsCss,
    /@utility pb-safe\s*\{\s*padding-bottom:\s*env\(safe-area-inset-bottom\)/,
    "pb-safe must map to env(safe-area-inset-bottom)",
  );
});

test("app/layout.tsx sets viewport-fit=cover so env(safe-area-inset-bottom) resolves on iOS Safari", () => {
  const layoutContent = read("app", "(zh)", "layout.tsx");
  assert.match(
    layoutContent,
    /viewportFit:\s*"cover"/,
    "the viewport export must set viewportFit: \"cover\"",
  );
});

// ---------------------------------------------------------------------------
// Scroll-hide behavior scoped to news article pages only
// ---------------------------------------------------------------------------

test("hide-on-scroll-down is gated by a news-article-page route check, not applied globally", () => {
  assert.match(
    navContent,
    /const isNewsArticlePage = \/\^\\\/news\\\/\[\^\/\]\+\/\.test\(pathname/,
    "must derive isNewsArticlePage from the current pathname via a /news/[id]-shaped regex",
  );
  assert.match(
    navContent,
    /const bottomNavHidden = isNewsArticlePage && scrollHidden;/,
    "bottomNavHidden must be derived (ANDed with isNewsArticlePage) so it's always false off news article pages",
  );
  assert.match(
    navContent,
    /useEffect\(\(\) => \{\s*if \(!isNewsArticlePage\) return;/,
    "the scroll listener itself must not even attach when not on a news article page",
  );
});

test("the scroll-direction listener hides on scroll-down and reveals on scroll-up", () => {
  const scrollEffectSrc = extractBetween(
    navContent,
    "const [scrollHidden, setScrollHidden]",
    "const bottomNavItems:",
  );
  assert.match(
    scrollEffectSrc,
    /setScrollHidden\(delta > 0 && currentY > 80\)/,
    "must hide (delta > 0, i.e. scrolling down) and otherwise reveal",
  );
  assert.match(
    scrollEffectSrc,
    /addEventListener\("scroll", handler, \{ passive: true \}\)/,
    "must follow this file's existing passive-scroll-listener convention (see the `scrolled` state above)",
  );
  assert.ok(
    !/setScrollHidden\(false\);\s*return;/.test(scrollEffectSrc),
    "must not call setState synchronously in the effect body (react-hooks/set-state-in-effect) — the off-page case is handled by deriving bottomNavHidden instead",
  );
});

test("the bottom bar's hide/show transform reacts to bottomNavHidden", () => {
  assert.match(bottomNavBlock, /bottomNavHidden \? "translate-y-full" : "translate-y-0"/);
  assert.match(bottomNavBlock, /transition-transform/);
});

// ---------------------------------------------------------------------------
// The hamburger drawer is left intact (additional layer, not a replacement)
// ---------------------------------------------------------------------------

test("the hamburger drawer and its toggle are untouched by this ticket", () => {
  assert.match(navContent, /mobileOpen && \(/, "the drawer's open-state gate must still exist");
  assert.match(navContent, /navModel\.map\(\(category\)/, "the drawer must still render the full category list");
  assert.match(navContent, /guideLinks\.map\(\(item\)/, "the drawer must still render the guide links");
});

// ---------------------------------------------------------------------------
// ScrollToTop no longer collides with the new fixed bottom bar on mobile
// ---------------------------------------------------------------------------

test("ScrollToTop clears the mobile bottom nav bar instead of overlapping it", () => {
  const scrollToTopContent = read("components", "ScrollToTop", "index.tsx");
  assert.match(
    scrollToTopContent,
    /bottom-24[^"]*lg:bottom-8/,
    "ScrollToTop must sit above the fixed bottom nav bar on mobile and restore its original position at lg:",
  );
});
