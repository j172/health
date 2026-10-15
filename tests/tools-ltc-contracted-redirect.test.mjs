import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// issue #447 (2.0 §D merge item M1): "/tools/ltc-contracted" was a noindex
// ghost page whose facility type and categories were a strict subset of
// "/tools/long-term-care" (which already covers every contracted service
// item it offered). It is retired, not merged — replaced by a permanent
// redirect to the page that already has everything it had.

test("the redirect rules permanently send /tools/ltc-contracted to /tools/long-term-care (issue #447)", async () => {
  // Moved out of next.config.js's redirects() into middleware.ts / a shared
  // data file 2026-10-15 — every permanent (308) redirect on the site was
  // 500ing because next.config.js's redirects() always adds a non-standard
  // Refresh header that this host's Cloudflare/LiteSpeed path can't handle.
  // See tests/middleware-permanent-redirects.test.mjs for the full story.
  const { PERMANENT_REDIRECT_RULES } = await import("../lib/redirects/permanentRedirectRules.ts");
  const rule = PERMANENT_REDIRECT_RULES.find((r) => r.source === "/tools/ltc-contracted");
  assert.ok(rule, "expected a redirect rule for /tools/ltc-contracted");
  assert.equal(rule.destination, "/tools/long-term-care");
  assert.equal(rule.permanent, true);
});

test("the /tools/ltc-contracted ghost page directory no longer exists (issue #447)", () => {
  const pageDir = path.join(process.cwd(), "app", "(zh)", "tools", "ltc-contracted");
  assert.ok(!fs.existsSync(pageDir), "app/(zh)/tools/ltc-contracted should be deleted, not just redirected around");
});

test("facilityConfigs.ts and the /tools index no longer reference ltc-contracted (issue #447)", () => {
  const facilityConfigsContent = fs.readFileSync(
    path.join(process.cwd(), "app", "(zh)", "tools", "facilityConfigs.ts"),
    "utf-8",
  );
  assert.ok(
    !facilityConfigsContent.includes('"ltc-contracted"'),
    "facilityConfigs.ts should no longer define a ltc-contracted entry",
  );

  const toolsIndexContent = fs.readFileSync(path.join(process.cwd(), "app", "(zh)", "tools", "page.tsx"), "utf-8");
  assert.ok(
    !toolsIndexContent.includes('"ltc-contracted"'),
    "/tools index page should no longer list ltc-contracted (e.g. in TOOL_ICONS)",
  );
});

test("catalog.ts no longer points relatedSlugs or its slug-alias map at ltc-contracted (issue #447)", () => {
  const catalogContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "tools", "catalog.ts"), "utf-8");
  assert.ok(
    !catalogContent.includes('"ltc-contracted"'),
    "catalog.ts should no longer reference the retired ltc-contracted slug anywhere (relatedSlugs or getToolCatalogEntry's alias map)",
  );
});

test("SeniorFriendlyContent links to the real long-term-care page, not the retired ltc-contracted slug (issue #447)", () => {
  const componentContent = fs.readFileSync(
    path.join(process.cwd(), "components", "Tools", "SeniorFriendlyContent.tsx"),
    "utf-8",
  );
  assert.ok(
    !componentContent.includes("/tools/ltc-contracted"),
    "SeniorFriendlyContent.tsx should not link to the retired /tools/ltc-contracted slug",
  );
  assert.ok(
    componentContent.includes('href="/tools/long-term-care"'),
    "SeniorFriendlyContent.tsx's 長照服務機構查詢 link should point at /tools/long-term-care",
  );
});
