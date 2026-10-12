import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// catalog.ts imports sibling modules without an extension (e.g. "./strokeOrder"),
// which Node's native TS type-stripping can't resolve on its own. Same resolver
// hook as lib/server/tools/footerLinks.test.mjs so this file can import
// catalog.ts directly instead of re-parsing it with regexes.
const REPO_ROOT = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

// Issue #450: en/ja/ko locale files must have a `catalog.<slug>` translation
// for every tool in TOOL_CATALOG, and a `nav.<labelKey>` translation for every
// TOOL_GROUP_META category, so switching language never silently falls back
// to the zh-TW title (see components/News/SiteFooter.tsx and SiteNav.tsx's
// `locale !== "zh-TW" ? t(\`catalog.${slug}\`, zhLabel) : zhLabel` fallback).
test("every TOOL_CATALOG entry has an en/ja/ko catalog translation", async () => {
  const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");

  const en = JSON.parse(fs.readFileSync("locales/en.json", "utf8"));
  const ja = JSON.parse(fs.readFileSync("locales/ja.json", "utf8"));
  const ko = JSON.parse(fs.readFileSync("locales/ko.json", "utf8"));

  const slugs = TOOL_CATALOG.map((tool) => tool.slug);
  assert.ok(slugs.length > 0, "TOOL_CATALOG should not be empty");

  for (const locale of [
    { name: "en", dict: en },
    { name: "ja", dict: ja },
    { name: "ko", dict: ko },
  ]) {
    const missing = slugs.filter((slug) => !locale.dict.catalog?.[slug]);
    assert.deepEqual(
      missing,
      [],
      `${locale.name}.json catalog is missing translations for: ${missing.join(", ")}`,
    );
  }
});

test("every TOOL_GROUP_META category has an en/ja/ko nav translation", async () => {
  const { TOOL_GROUP_META } = await import("../lib/server/tools/catalog.ts");

  const en = JSON.parse(fs.readFileSync("locales/en.json", "utf8"));
  const ja = JSON.parse(fs.readFileSync("locales/ja.json", "utf8"));
  const ko = JSON.parse(fs.readFileSync("locales/ko.json", "utf8"));

  const navKeys = TOOL_GROUP_META.map((meta) => meta.labelKey.replace(/^nav\./, ""));
  assert.ok(navKeys.length > 0, "TOOL_GROUP_META should not be empty");

  for (const locale of [
    { name: "en", dict: en },
    { name: "ja", dict: ja },
    { name: "ko", dict: ko },
  ]) {
    const missing = navKeys.filter((key) => !locale.dict.nav?.[key]);
    assert.deepEqual(
      missing,
      [],
      `${locale.name}.json nav is missing category translations for: ${missing.join(", ")}`,
    );
  }
});

test("catalog translations are non-empty strings, not accidental duplicates of the key", () => {
  for (const localeName of ["en", "ja", "ko"]) {
    const dict = JSON.parse(fs.readFileSync(`locales/${localeName}.json`, "utf8"));
    for (const [slug, value] of Object.entries(dict.catalog ?? {})) {
      assert.equal(typeof value, "string", `${localeName}.json catalog.${slug} must be a string`);
      assert.ok(value.trim().length > 0, `${localeName}.json catalog.${slug} must not be empty`);
      assert.notEqual(value, slug, `${localeName}.json catalog.${slug} must not equal its own key`);
    }
  }
});
