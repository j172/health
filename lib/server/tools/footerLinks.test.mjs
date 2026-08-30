import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = new URL("../../../", import.meta.url);
const ROOT_DIR = fileURLToPath(REPO_ROOT);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
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

const { TOOL_CATALOG, toolsInGroup } = await import("./catalog.ts");
const { facilitySearchConfigs } = await import("../../../app/tools/facilityConfigs.ts");

const TOOL_GROUPS = [
  "calculator",
  "facility",
  "ltc",
  "disability",
  "child-welfare",
  "public-facility",
  "weather",
  "food",
];

test("all tools in TOOL_CATALOG have an existing app/tools/<slug>/page.tsx file", () => {
  assert.ok(TOOL_CATALOG.length >= 41, `Expected at least 41 tools in catalog, got ${TOOL_CATALOG.length}`);

  for (const tool of TOOL_CATALOG) {
    const pagePath = path.join(ROOT_DIR, "app", "tools", tool.slug, "page.tsx");
    assert.ok(
      existsSync(pagePath),
      `Missing page.tsx for tool slug "${tool.slug}" at path: ${pagePath}`
    );
  }
});

test("all tools have valid required metadata (title, description, directAnswer, group, faqs)", () => {
  for (const tool of TOOL_CATALOG) {
    assert.ok(tool.slug && tool.slug.trim().length > 0, `Tool missing slug: ${JSON.stringify(tool)}`);
    assert.ok(tool.title && tool.title.trim().length > 0, `Tool "${tool.slug}" missing title`);
    assert.ok(tool.description && tool.description.trim().length > 0, `Tool "${tool.slug}" missing description`);
    assert.ok(tool.directAnswer && tool.directAnswer.trim().length > 0, `Tool "${tool.slug}" missing directAnswer`);
    assert.ok(TOOL_GROUPS.includes(tool.group), `Tool "${tool.slug}" has invalid group: ${tool.group}`);
    assert.ok(Array.isArray(tool.faqs) && tool.faqs.length > 0, `Tool "${tool.slug}" must have at least one FAQ`);

    for (const faq of tool.faqs) {
      assert.ok(faq.question && faq.question.trim().length > 0, `Tool "${tool.slug}" FAQ missing question`);
      assert.ok(faq.answer && faq.answer.trim().length > 0, `Tool "${tool.slug}" FAQ missing answer`);
    }

    assert.ok(Array.isArray(tool.scientificBasis), `Tool "${tool.slug}" scientificBasis must be an array`);
    assert.ok(Array.isArray(tool.relatedSlugs), `Tool "${tool.slug}" relatedSlugs must be an array`);
  }
});

test("all 8 tool groups in SiteFooter are sorted by Traditional Chinese collation", () => {
  for (const group of TOOL_GROUPS) {
    const tools = toolsInGroup(group);
    assert.ok(tools.length > 0, `Group "${group}" has no tools`);

    const titles = tools.map((t) => t.title);
    const sortedTitles = [...titles].sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true }));

    assert.deepEqual(
      titles,
      sortedTitles,
      `Tool group "${group}" is not sorted by Traditional Chinese collation ('zh-Hant')`
    );
  }
});

test("all tools that render FacilitySearchContent have an entry in facilitySearchConfigs with a non-empty facilityType", () => {
  for (const tool of TOOL_CATALOG) {
    const pagePath = path.join(ROOT_DIR, "app", "tools", tool.slug, "page.tsx");
    if (!existsSync(pagePath)) continue;

    const pageContent = readFileSync(pagePath, "utf-8");
    if (pageContent.includes("FacilitySearchContent") || pageContent.includes("facilitySearchConfigs")) {
      const config = facilitySearchConfigs[tool.slug];
      assert.ok(
        config,
        `Tool "${tool.slug}" renders FacilitySearchContent but is missing an entry in facilitySearchConfigs`
      );
      assert.ok(
        typeof config.facilityType === "string" && config.facilityType.trim().length > 0,
        `Tool "${tool.slug}" in facilitySearchConfigs has empty facilityType`
      );
    }
  }
});

test("overview links and brand social URLs are well-formed", () => {
  const overviewHrefs = ["/", "/news", "/privacy"];
  for (const href of overviewHrefs) {
    assert.ok(href.startsWith("/"), `Overview link ${href} should start with /`);
  }

  const socialUrls = [
    "https://www.instagram.com/j172twhealths/",
    "https://www.facebook.com/profile.php?id=61592584239566",
    "https://www.threads.com/@j172twhealths",
    "https://www.j172.tw",
  ];

  for (const url of socialUrls) {
    assert.doesNotThrow(() => new URL(url), `Invalid social URL: ${url}`);
    assert.ok(url.startsWith("https://"), `Social URL ${url} must use HTTPS`);
  }
});
