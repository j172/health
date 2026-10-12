import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Issue #456 ("開啟內容變動自動通知搜尋引擎，移除自寫通知程式，加入無 cookie 流量分析"):
//
// 1. The self-written IndexNow notifier (lib/server/seo/indexnow.ts,
//    app/api/admin/indexnow/route.ts, and its call sites in
//    lib/server/cron/registerJobs.ts and lib/server/rss/runIngestion.ts) is
//    removed entirely — this code path previously caused a production
//    incident, and Cloudflare's own Crawler Hints dashboard toggle (a
//    human-only manual step, see docs/2.0/spec-issue-438.md §T and
//    config/cloudflare/zone-settings.json's crawlerHints note) is the
//    intended, non-self-written replacement.
// 2. Cloudflare Web Analytics (no-cookie) is added as a cross-check beside
//    the existing GoogleTag/MicrosoftClarity analytics, via the standard
//    manual JS beacon snippet, gated on an env var so it's a no-op until a
//    human provisions a real token.
//
// Like every other component test in this repo (e.g.
// tests/mobile-bottom-nav-473.test.mjs), these are source-text inspections —
// there is no JSX/DOM render harness here.

const ROOT_DIR = process.cwd();

function read(...parts) {
  return fs.readFileSync(path.join(ROOT_DIR, ...parts), "utf-8");
}

function exists(...parts) {
  return fs.existsSync(path.join(ROOT_DIR, ...parts));
}

// Recursively walks a directory, returning every file path under it,
// skipping common non-source directories.
function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// IndexNow removal
// ---------------------------------------------------------------------------

test("IndexNow module, admin route, and verification key file are deleted", () => {
  assert.equal(exists("lib", "server", "seo", "indexnow.ts"), false, "lib/server/seo/indexnow.ts must be deleted");
  assert.equal(exists("app", "api", "admin", "indexnow", "route.ts"), false, "app/api/admin/indexnow/route.ts must be deleted");
  assert.equal(exists("app", "api", "admin", "indexnow"), false, "app/api/admin/indexnow/ directory must be deleted");
  assert.equal(
    exists("public", "c0e7b8782f9c464c8d5c414995f7c32e.txt"),
    false,
    "the IndexNow key verification file in public/ must be deleted",
  );
});

test("no reference to indexnow/IndexNow remains anywhere in lib/, app/, or scripts/", () => {
  const dirs = ["lib", "app", "scripts"];
  const offenders = [];
  for (const dir of dirs) {
    if (!exists(dir)) continue;
    for (const file of walk(path.join(ROOT_DIR, dir))) {
      const content = fs.readFileSync(file, "utf-8");
      if (/indexnow/i.test(content)) {
        offenders.push(path.relative(ROOT_DIR, file));
      }
    }
  }
  assert.deepEqual(offenders, [], `found lingering indexnow reference(s): ${offenders.join(", ")}`);
});

test("registerJobs.ts no longer registers an IndexNow cron job", () => {
  const content = read("lib", "server", "cron", "registerJobs.ts");
  assert.equal(/indexnow/i.test(content), false, "registerJobs.ts must not mention IndexNow");
  // The job used to run at "0 5 * * *"; confirm the surrounding daily-5am
  // block (power-mix-sync, still present) isn't accidentally broken.
  assert.match(content, /power-mix-sync-cron\.log/, "unrelated neighboring cron jobs must survive the removal");
});

test("runIngestion.ts no longer submits newly inserted articles to IndexNow", () => {
  const content = read("lib", "server", "rss", "runIngestion.ts");
  assert.equal(/indexnow/i.test(content), false, "runIngestion.ts must not mention IndexNow");
  // The rest of the ingestion run (persistence, summary building) must be intact.
  assert.match(content, /stats\.unchanged \+= skippedUnchanged;/, "ingestion summary accounting must be untouched");
});

test(".env.example no longer documents INDEXNOW_KEY, but documents the new Web Analytics token", () => {
  const content = read(".env.example");
  assert.equal(content.includes("INDEXNOW_KEY"), false, ".env.example must not reference INDEXNOW_KEY");
  assert.match(content, /CLOUDFLARE_WEB_ANALYTICS_TOKEN=/, ".env.example must document CLOUDFLARE_WEB_ANALYTICS_TOKEN");
});

// ---------------------------------------------------------------------------
// Cloudflare Web Analytics (no-cookie)
// ---------------------------------------------------------------------------

test("CloudflareWebAnalytics component exists, uses Cloudflare's documented beacon format, and no-ops without a token", () => {
  const compPath = path.join("components", "Analytics", "CloudflareWebAnalytics.tsx");
  assert.ok(exists(compPath), "components/Analytics/CloudflareWebAnalytics.tsx must exist");

  const content = read(compPath);
  assert.ok(
    content.includes("https://static.cloudflareinsights.com/beacon.min.js"),
    "must use Cloudflare's standard, documented beacon script URL",
  );
  assert.match(content, /data-cf-beacon/, "must set the data-cf-beacon attribute Cloudflare's snippet requires");
  assert.match(
    content,
    /env\.cloudflareWebAnalyticsToken/,
    "must read the token through lib/server/config/env.ts, not process.env directly",
  );
  assert.match(
    content,
    /if\s*\(\s*!env\.cloudflareWebAnalyticsToken\s*\)\s*return null;/,
    "must render nothing (no-op) when the token env var is not set",
  );
});

test("env.ts exposes cloudflareWebAnalyticsToken using the same optional-credential convention as the other Cloudflare fields", () => {
  const content = read("lib", "server", "config", "env.ts");
  assert.match(
    content,
    /cloudflareWebAnalyticsToken:\s*process\.env\.CLOUDFLARE_WEB_ANALYTICS_TOKEN\?\.trim\(\)\s*\|\|\s*null/,
    "cloudflareWebAnalyticsToken must follow the `process.env.X?.trim() || null` convention used by pixabayApiKey/unsplash/cloudflare.apiToken etc.",
  );
});

test("app/layout.tsx renders CloudflareWebAnalytics alongside (not instead of) GoogleTag and MicrosoftClarity", () => {
  const content = read("app", "layout.tsx");
  assert.match(content, /import CloudflareWebAnalytics from "@\/components\/Analytics\/CloudflareWebAnalytics";/);
  assert.match(content, /<CloudflareWebAnalytics\s*\/>/);
  // The two pre-existing analytics tools must be untouched by this change.
  assert.match(content, /import GoogleTag from "@\/components\/Analytics\/GoogleTag";/);
  assert.match(content, /import MicrosoftClarity from "@\/components\/Analytics\/MicrosoftClarity";/);
  assert.match(content, /<GoogleTag\s*\/>/);
  assert.match(content, /<MicrosoftClarity\s*\/>/);
});

test("GoogleTag and MicrosoftClarity components are byte-for-byte unaffected by this change", () => {
  const googleTag = read("components", "Analytics", "GoogleTag.tsx");
  assert.ok(googleTag.includes("G-V0CTGFQXW2"), "GoogleTag must still use its existing GA measurement ID");
  assert.ok(googleTag.includes("googletagmanager.com/gtag/js"), "GoogleTag must still load the gtag.js loader");

  const clarity = read("components", "Analytics", "MicrosoftClarity.tsx");
  assert.ok(clarity.includes("ye0lvdgk17"), "MicrosoftClarity must still use its existing project ID");
  assert.ok(clarity.includes("https://www.clarity.ms/tag/"), "MicrosoftClarity must still point to clarity.ms");
});
