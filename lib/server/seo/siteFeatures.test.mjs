import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

test("Microsoft Clarity tracking component exists and contains the requested project id", () => {
  const clarityPath = resolve(REPO_ROOT, "components/Analytics/MicrosoftClarity.tsx");
  assert.ok(existsSync(clarityPath), "MicrosoftClarity.tsx must exist");

  const clarityContent = readFileSync(clarityPath, "utf8");
  assert.ok(clarityContent.includes("ye0lvdgk17"), "Clarity script must use project ID ye0lvdgk17");
  assert.ok(clarityContent.includes("https://www.clarity.ms/tag/"), "Clarity script must point to clarity.ms tag");
});

test("GooglePreferredSourceButton exists and is embedded in news detail page", () => {
  const btnPath = resolve(REPO_ROOT, "components/News/GooglePreferredSourceButton.tsx");
  assert.ok(existsSync(btnPath), "GooglePreferredSourceButton.tsx must exist");

  const btnContent = readFileSync(btnPath, "utf8");
  assert.ok(btnContent.includes("preferences/source?q=health.j172.tw"), "Button must target health.j172.tw Google preferences");
  assert.ok(btnContent.includes("加入Google首選"), "Button label must be 加入Google首選");

  const pagePath = resolve(REPO_ROOT, "app/(zh)/news/[id]/page.tsx");
  const pageContent = readFileSync(pagePath, "utf8");
  assert.ok(pageContent.includes("<GooglePreferredSourceButton"), "news detail page must render GooglePreferredSourceButton");
});

test("Simplified Chinese (zh-CN) is completely decommissioned", () => {
  const zhCnJson = resolve(REPO_ROOT, "locales/zh-CN.json");
  assert.equal(existsSync(zhCnJson), false, "locales/zh-CN.json must be deleted");

  const buildScript = resolve(REPO_ROOT, "scripts/build-zh-cn-locale.mjs");
  assert.equal(existsSync(buildScript), false, "scripts/build-zh-cn-locale.mjs must be deleted");

  const togglerPath = resolve(REPO_ROOT, "components/Header/LanguageToggler.tsx");
  const togglerContent = readFileSync(togglerPath, "utf8");
  assert.equal(togglerContent.includes("zh-CN"), false, "LanguageToggler must not offer zh-CN");
  assert.equal(togglerContent.includes("简体中文"), false, "LanguageToggler must not include 简体中文");
});
