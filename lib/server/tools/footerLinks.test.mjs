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

const { TOOL_CATALOG, toolsInGroup, TOOL_GROUP_META } = await import("./catalog.ts");
const { compareByStrokeOrder } = await import("./strokeOrder.ts");
const { facilitySearchConfigs } = await import("../../../app/(zh)/tools/facilityConfigs.ts");
const { buildFooterModel, CIVIC_PARTNER_LINKS, GUIDES } = await import("./navModel.ts");

// issue #442: reclassified from 9 groups to 7 — TOOL_GROUP_META in catalog.ts
// is the single source of truth Nav/Footer/`/tools` all derive from now.
const TOOL_GROUPS = [
  "health-assessment",
  "medical-care",
  "elder-care-welfare",
  "family",
  "disaster-alerts",
  "environment-food",
  "life-culture",
];

test("all tools in TOOL_CATALOG have an existing app/tools/<slug>/page.tsx file", () => {
  assert.ok(TOOL_CATALOG.length >= 41, `Expected at least 41 tools in catalog, got ${TOOL_CATALOG.length}`);

  for (const tool of TOOL_CATALOG) {
    const pagePath = path.join(ROOT_DIR, "app", "(zh)", "tools", tool.slug, "page.tsx");
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

test("all 7 tool groups in SiteNav/SiteFooter are sorted by the stroke-order rule", () => {
  // spec: navbar-footer-reclassification-and-merges §0.2 — Latin-named items
  // form one alphabetical block ahead of every Chinese label, then Chinese
  // items sort by first-character stroke count ascending. `toolsInGroup`
  // applies `compareByStrokeOrder` internally; this test just confirms the
  // order it returns actually satisfies that rule (not the old plain
  // zh-Hant collation the 7-group layout used).
  for (const group of TOOL_GROUPS) {
    const tools = toolsInGroup(group);
    assert.ok(tools.length > 0, `Group "${group}" has no tools`);

    const titles = tools.map((t) => t.title);
    const sortedTitles = [...titles].sort(compareByStrokeOrder);

    assert.deepEqual(
      titles,
      sortedTitles,
      `Tool group "${group}" is not sorted by the stroke-order rule`
    );
  }
});

test("all tools that render FacilitySearchContent have an entry in facilitySearchConfigs with a non-empty facilityType", () => {
  for (const tool of TOOL_CATALOG) {
    const pagePath = path.join(ROOT_DIR, "app", "(zh)", "tools", tool.slug, "page.tsx");
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
  const overview = buildFooterModel().find((b) => b.id === "overview");
  for (const link of overview.links) {
    assert.ok(link.href.startsWith("/"), `Overview link ${link.href} should start with /`);
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

// ---------------------------------------------------------------------------
// SiteFooter.tsx 4-column wiring (issue #461) — buildFooterModel() itself is
// already exhaustively covered by navModel.test.mjs (issue #443); the tests
// below instead guard the *wiring*: that SiteFooter.tsx actually consumes
// buildFooterModel() rather than hand-rolling its own 11-column/~95-link
// structure again, and that the resulting 4 blocks/~24 links match what the
// issue asked for.
// ---------------------------------------------------------------------------

const SITE_FOOTER_SOURCE = readFileSync(
  path.join(ROOT_DIR, "components", "News", "SiteFooter.tsx"),
  "utf-8",
);

test("SiteFooter.tsx wires in buildFooterModel() instead of hand-rolling its own column data", () => {
  assert.ok(
    SITE_FOOTER_SOURCE.includes('from "@/lib/server/tools/navModel"'),
    "SiteFooter.tsx should import from lib/server/tools/navModel",
  );
  assert.ok(
    SITE_FOOTER_SOURCE.includes("buildFooterModel"),
    "SiteFooter.tsx should call buildFooterModel()",
  );

  // Dead code from the old hand-rolled structure must be gone, not kept
  // alongside the new model (issue #461: "don't maintain both").
  assert.ok(
    !SITE_FOOTER_SOURCE.includes("const civicPartnerLinks"),
    "SiteFooter.tsx's own local civicPartnerLinks array should be removed; use the model's civic-partners block instead",
  );
  assert.ok(
    !SITE_FOOTER_SOURCE.includes("TOOL_GROUP_META"),
    "SiteFooter.tsx should no longer iterate TOOL_GROUP_META directly to build one column per tool group",
  );
  // Narrower than a blanket ban on the token: issue #451 legitimately added
  // appendOutboundUtm() calls to this same file for OTHER hardcoded links
  // (footer social icons, the main-site crosslink) that are unrelated to the
  // civic-partners block and were never wrapped by buildFooterModel(). What
  // must not happen is re-wrapping the model's own civic-partner `link.href`
  // output a second time.
  assert.ok(
    !/appendOutboundUtm\(\s*(partner|link)\.(url|href)/.test(SITE_FOOTER_SOURCE),
    "SiteFooter.tsx must not re-wrap civic-partner links with its own UTM call; buildFooterModel() already does this",
  );
  // No individual /tools/<slug> (or /tools/category/<slug>) link
  // construction left in the component itself — every such href now comes
  // from the model via a plain `href={link.href}`, not from a template
  // literal built in the component (the only remaining "/tools/" substring
  // is the lib/server/tools/navModel import path itself).
  assert.ok(
    !/["'`]\/tools\//.test(SITE_FOOTER_SOURCE),
    "SiteFooter.tsx should not construct any /tools/... link itself",
  );
});

test("buildFooterModel() (as wired into SiteFooter.tsx) renders exactly 4 columns", () => {
  const model = buildFooterModel();
  assert.equal(model.length, 4);
  assert.deepEqual(
    model.map((b) => b.id),
    ["overview", "categories", "guides", "civic-partners"],
  );
});

test("the categories column (column 2) has zero individual tool links — only category links", () => {
  const model = buildFooterModel();
  const categories = model.find((b) => b.id === "categories");
  assert.equal(categories.links.length, 7, "Expected 7 category links");

  const toolSlugs = new Set(TOOL_CATALOG.map((t) => t.slug));
  for (const link of categories.links) {
    assert.ok(
      link.href.startsWith("/tools/category/"),
      `Category column link should point at a category page, got: ${link.href}`,
    );
    const afterPrefix = link.href.slice("/tools/category/".length);
    assert.ok(
      !toolSlugs.has(afterPrefix),
      `Category column must not contain an individual tool link, got: ${link.href}`,
    );
  }

  const linkedGroups = categories.links
    .map((l) => l.href.replace("/tools/category/", ""))
    .sort();
  assert.deepEqual(linkedGroups, TOOL_GROUP_META.map((m) => m.group).sort());
});

test("footer link/column counts match the issue's \"約 24 個連結\" target exactly", () => {
  const model = buildFooterModel();
  const countsById = Object.fromEntries(
    model.map((b) => [b.id, b.links.length]),
  );
  assert.deepEqual(countsById, {
    overview: 5,
    categories: 7,
    guides: 5,
    "civic-partners": 7,
  });

  const total = model.reduce((sum, b) => sum + b.links.length, 0);
  assert.equal(total, 24, `Expected exactly 24 total footer links, got ${total}`);
  assert.equal(GUIDES.length, 5);
  assert.equal(CIVIC_PARTNER_LINKS.length, 7);
});

test("civic-partner links are rendered exactly as buildFooterModel() provides them, not re-wrapped", () => {
  const model = buildFooterModel();
  const civic = model.find((b) => b.id === "civic-partners");
  assert.equal(civic.links.length, 7);

  for (const link of civic.links) {
    // Already UTM-wrapped once by buildFooterModel via appendOutboundUtm.
    assert.ok(link.href.includes("utm_source="), `Expected UTM params on ${link.href}`);
    // Not double-wrapped: exactly one utm_source param, not two.
    const occurrences = link.href.split("utm_source=").length - 1;
    assert.equal(occurrences, 1, `Expected exactly one utm_source on ${link.href}, got re-wrapped: ${link.href}`);
  }

  // Confirm this matches CIVIC_PARTNER_LINKS' underlying (un-UTM'd) hosts.
  const modelHosts = civic.links.map((l) => new URL(l.href).hostname).sort();
  const sourceHosts = CIVIC_PARTNER_LINKS.map((l) => new URL(l.href).hostname).sort();
  assert.deepEqual(modelHosts, sourceHosts);
});

