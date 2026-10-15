import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// issue #591 (parent #583): "/tools/travel-epidemic-alerts" (國際旅遊疫情與
// 即時情報地圖) is retired in favor of the 國際疫情 item that issue #589
// already shipped inside "/tools/global-watch" (which reuses this page's own
// TravelEpidemicAlertsContent component as-is — that shared component is
// NOT deleted, only this standalone route). This page only ever had a zh
// route (no app/[locale]/tools/travel-epidemic-alerts sibling existed), so a
// single redirect entry is enough — no per-locale `?lang=` variants to carry.

test("the redirect rules permanently send /tools/travel-epidemic-alerts to /tools/global-watch/epidemics (issue #591)", async () => {
  // Moved out of next.config.js's redirects() into middleware.ts / a shared
  // data file 2026-10-15 — every permanent (308) redirect on the site was
  // 500ing because next.config.js's redirects() always adds a non-standard
  // Refresh header that this host's Cloudflare/LiteSpeed path can't handle.
  // See tests/middleware-permanent-redirects.test.mjs for the full story.
  const { PERMANENT_REDIRECT_RULES } = await import("../lib/redirects/permanentRedirectRules.ts");
  const rule = PERMANENT_REDIRECT_RULES.find((r) => r.source === "/tools/travel-epidemic-alerts");
  assert.ok(rule, "expected a redirect rule for /tools/travel-epidemic-alerts");
  assert.equal(rule.destination, "/tools/global-watch/epidemics");
  assert.equal(rule.permanent, true);
});

test("the /tools/travel-epidemic-alerts page directory no longer exists (issue #591)", () => {
  const pageDir = path.join(process.cwd(), "app", "(zh)", "tools", "travel-epidemic-alerts");
  assert.ok(
    !fs.existsSync(pageDir),
    "app/(zh)/tools/travel-epidemic-alerts should be deleted, not just redirected around",
  );
});

test("components/Epidemic/TravelEpidemicAlertsContent.tsx is still present (reused by global-watch's epidemics item) (issue #591)", () => {
  const componentPath = path.join(
    process.cwd(),
    "components",
    "Epidemic",
    "TravelEpidemicAlertsContent.tsx",
  );
  assert.ok(
    fs.existsSync(componentPath),
    "the shared TravelEpidemicAlertsContent component must NOT be deleted — only the old standalone route",
  );
});

test("catalog.ts no longer defines a standalone travel-epidemic-alerts TOOL_CATALOG entry (issue #591)", () => {
  const catalogContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "tools", "catalog.ts"), "utf-8");
  assert.ok(
    !/slug:\s*"travel-epidemic-alerts"/.test(catalogContent),
    'catalog.ts should no longer define a TOOL_CATALOG entry with slug "travel-epidemic-alerts"',
  );
  assert.ok(
    /slug:\s*"global-watch"/.test(catalogContent),
    "catalog.ts should still define the global-watch TOOL_CATALOG entry (shipped by #587, not duplicated by this ticket)",
  );
});

test("no TOOL_CATALOG entry's relatedSlugs still references travel-epidemic-alerts (issue #591)", () => {
  const catalogContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "tools", "catalog.ts"), "utf-8");
  assert.ok(
    !/relatedSlugs:\s*\[[^\]]*"travel-epidemic-alerts"[^\]]*\]/.test(catalogContent),
    "no relatedSlugs array in catalog.ts should still reference the retired travel-epidemic-alerts slug",
  );
});

test("the /tools index no longer references travel-epidemic-alerts (issue #591)", () => {
  const toolsIndexContent = fs.readFileSync(path.join(process.cwd(), "app", "(zh)", "tools", "page.tsx"), "utf-8");
  assert.ok(
    !toolsIndexContent.includes('"travel-epidemic-alerts"'),
    "/tools index page should no longer list travel-epidemic-alerts (e.g. in TOOL_ICONS)",
  );
});

test("navModel.ts's travel-health guide no longer points its first step at the retired travel-epidemic-alerts slug (issue #591)", () => {
  const navModelContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "tools", "navModel.ts"), "utf-8");
  assert.ok(
    !navModelContent.includes('toolSlug: "travel-epidemic-alerts"'),
    "navModel.ts should no longer have a toolSlug: \"travel-epidemic-alerts\" step (it would throw via getToolCatalogEntry's typo guard now that the catalog entry is gone)",
  );
  assert.ok(
    navModelContent.includes('toolSlug: "global-watch"'),
    'the 出國前查旅遊疫情 step should now point toolSlug at "global-watch"',
  );
});

test("CdcAlertSidebarWidget.tsx's footer link points at the new global-watch epidemics item (issue #591)", () => {
  const widgetContent = fs.readFileSync(
    path.join(process.cwd(), "components", "Tools", "CdcAlertSidebarWidget.tsx"),
    "utf-8",
  );
  assert.ok(
    !widgetContent.includes("/tools/travel-epidemic-alerts"),
    "CdcAlertSidebarWidget.tsx should not link to the retired /tools/travel-epidemic-alerts route",
  );
  assert.ok(
    widgetContent.includes('footerHref="/tools/global-watch/epidemics"'),
    "CdcAlertSidebarWidget.tsx's footerHref should point at /tools/global-watch/epidemics",
  );
});

test("en/ja/ko locale files no longer carry the orphaned travel-epidemic-alerts catalog translation key (issue #591)", () => {
  for (const locale of ["en", "ja", "ko"]) {
    const localeContent = fs.readFileSync(path.join(process.cwd(), "locales", `${locale}.json`), "utf-8");
    assert.ok(
      !localeContent.includes('"travel-epidemic-alerts"'),
      `locales/${locale}.json should no longer have a "travel-epidemic-alerts" catalog translation key`,
    );
    assert.ok(
      localeContent.includes('"global-watch"'),
      `locales/${locale}.json should still have the "global-watch" catalog translation key (shipped by #587)`,
    );
    // Must still parse as valid JSON after the key removal.
    assert.doesNotThrow(() => JSON.parse(localeContent), `locales/${locale}.json should still parse as valid JSON`);
  }
});
