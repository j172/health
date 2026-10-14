import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listWarmPaths } from "../scripts/list-warm-paths.mjs";

// Confirmed live 2026-10-14: `next build` runs on the deploy runner with no
// database, so DB-backed ISR tool pages (/tools/uv, /tools/earthquakes, ...)
// went live as empty build-time prerenders after every deploy, and Cloudflare
// cached them — while the database itself had the data all along.

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => fs.readFileSync(path.join(REPO_ROOT, ...parts), "utf8");

test("listWarmPaths covers every catalog tool slug", () => {
  const paths = new Set(listWarmPaths(REPO_ROOT));
  const catalog = read("lib", "server", "tools", "catalog.ts");
  const slugs = [...catalog.matchAll(/slug: "([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(slugs.length > 50, "expected to parse the full tool catalog");
  for (const slug of slugs) assert.ok(paths.has(`/tools/${slug}`), `missing /tools/${slug}`);
});

test("listWarmPaths covers static locale tool pages and the main entry pages, without dynamic segments or duplicates", () => {
  const paths = listWarmPaths(REPO_ROOT);
  for (const p of ["/", "/tools", "/nearby", "/en", "/en/tools/uv", "/ja/tools/earthquakes", "/ko/tools/aqi"]) {
    assert.ok(paths.includes(p), `missing ${p}`);
  }
  assert.ok(!paths.some((p) => p.includes("[")), "dynamic route segments must not be warmed literally");
  assert.equal(new Set(paths).size, paths.length, "no duplicate paths");
});

test("the revalidate-paths admin route authenticates before invalidating, and validates paths", () => {
  const src = read("app", "api", "admin", "revalidate-paths", "route.ts");
  assert.ok(
    src.indexOf("requireAdminSecret(request)") < src.indexOf("revalidatePath("),
    "must check the admin secret before calling revalidatePath",
  );
  assert.match(src, /revalidatePath\("\/", "layout"\)/, 'scope "all" must invalidate the root layout');
  assert.match(src, /!value\.startsWith\("\/\/"\)/, "protocol-relative paths must be rejected");
});

test("deploy-ftps.yml regenerates ISR pages after the new build is live and before purging Cloudflare", () => {
  const wf = read(".github", "workflows", "deploy-ftps.yml");
  const readApply = wf.indexOf("- name: Read apply status");
  const regenerate = wf.indexOf("- name: Regenerate DB-backed ISR pages before purging Cloudflare");
  const purge = wf.indexOf("- name: Purge Cloudflare cache");
  assert.ok(readApply !== -1 && regenerate !== -1 && purge !== -1);
  assert.ok(readApply < regenerate && regenerate < purge, "order must be: apply status -> regenerate -> purge");

  const step = wf.slice(regenerate, purge);
  assert.match(step, /curl -K -/, "admin secret must go through curl's stdin config, not the remote argv");
  assert.match(step, /scripts\/list-warm-paths\.mjs/);
  assert.match(step, /scripts\/warm-isr-pages\.sh/);
});
