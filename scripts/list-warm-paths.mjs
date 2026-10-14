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

export function listWarmPaths(repoRoot) {
  const catalog = fs.readFileSync(path.join(repoRoot, "lib", "server", "tools", "catalog.ts"), "utf8");
  const catalogSlugs = [...catalog.matchAll(/slug: "([a-z0-9-]+)"/g)].map((m) => m[1]);

  const localeToolDirs = staticRouteDirs(path.join(repoRoot, "app", "[locale]", "tools"));

  const paths = [
    ...ENTRY_PATHS,
    ...PATH_LOCALES.map((locale) => `/${locale}`),
    ...catalogSlugs.map((slug) => `/tools/${slug}`),
    ...PATH_LOCALES.flatMap((locale) => localeToolDirs.map((dir) => `/${locale}/tools/${dir}`)),
  ];
  return [...new Set(paths)];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  process.stdout.write(`${listWarmPaths(repoRoot).join("\n")}\n`);
}
