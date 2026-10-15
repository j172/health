#!/usr/bin/env node
/**
 * Prints (one per line) the URL paths deploy-ftps.yml warms right after a
 * new build goes live — see app/api/admin/revalidate-paths/route.ts for why
 * this is needed at all (every DB-backed ISR page is prerendered empty,
 * because `next build` runs without database access).
 *
 * Derived from the source tree rather than a hand-kept list, so a new tool
 * is warmed automatically: every catalog slug as /tools/<slug>, every
 * statically-routed locale tool page as /<locale>/tools/<dir>, plus the
 * main entry pages.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATH_LOCALES = ["en", "ja", "ko"];

const ENTRY_PATHS = ["/", "/tools", "/nearby", "/news", "/guides"];

const staticRouteDirs = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-z0-9-]+$/.test(entry.name))
    .filter((entry) => fs.existsSync(path.join(dir, entry.name, "page.tsx")))
    .map((entry) => entry.name);
};

// issue #590 (parent #583): a directory like "global-watch" can host nested
// item sub-routes ("global-watch/earthquakes") one level deeper than
// staticRouteDirs looks — the retired "/tools/earthquakes" flat page's real
// content moved to exactly this shape, and without this, nothing ever warms
// it (the "empty build-time prerender" bug this whole script exists to
// prevent, on the DB-backed page that replaced the one staticRouteDirs used
// to warm directly). Deliberately independent of whether the parent
// directory also has its own page.tsx (the zh side's "global-watch" does —
// the base shell page — while the locale side's deliberately doesn't, per
// tests/i18n-routing-485.test.mjs's guardrail); either way, both the
// parent's own page (if any, via staticRouteDirs) and its nested items (via
// this) need warming, so this never skips a directory just because
// staticRouteDirs already covered it too.
const nestedStaticRouteDirs = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const nested = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z0-9-]+$/.test(entry.name)) continue;
    const subDir = path.join(dir, entry.name);
    for (const item of staticRouteDirs(subDir)) {
      nested.push(`${entry.name}/${item}`);
    }
  }
  return nested;
};

export function listWarmPaths(repoRoot) {
  const catalog = fs.readFileSync(path.join(repoRoot, "lib", "server", "tools", "catalog.ts"), "utf8");
  const catalogSlugs = [...catalog.matchAll(/slug: "([a-z0-9-]+)"/g)].map((m) => m[1]);

  const zhToolsDir = path.join(repoRoot, "app", "(zh)", "tools");
  const localeToolsDir = path.join(repoRoot, "app", "[locale]", "tools");
  const localeToolDirs = staticRouteDirs(localeToolsDir);
  const zhNestedToolDirs = nestedStaticRouteDirs(zhToolsDir);
  const localeNestedToolDirs = nestedStaticRouteDirs(localeToolsDir);

  const paths = [
    ...ENTRY_PATHS,
    ...PATH_LOCALES.map((locale) => `/${locale}`),
    ...catalogSlugs.map((slug) => `/tools/${slug}`),
    ...zhNestedToolDirs.map((dir) => `/tools/${dir}`),
    ...PATH_LOCALES.flatMap((locale) => localeToolDirs.map((dir) => `/${locale}/tools/${dir}`)),
    ...PATH_LOCALES.flatMap((locale) => localeNestedToolDirs.map((dir) => `/${locale}/tools/${dir}`)),
  ];
  return [...new Set(paths)];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  process.stdout.write(`${listWarmPaths(repoRoot).join("\n")}\n`);
}
