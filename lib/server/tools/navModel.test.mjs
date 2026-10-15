import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

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

const { TOOL_CATALOG, TOOL_GROUP_META, getToolCatalogEntry } =
  await import("./catalog.ts");
const {
  buildNavModel,
  buildFooterModel,
  buildCategoryPage,
  buildRedirects,
  CATALOG_REDIRECTS,
  GUIDES,
  buildGuide,
  CIVIC_PARTNER_LINKS,
  getRelatedTools,
} = await import("./navModel.ts");

const EXPECTED_GROUPS = TOOL_GROUP_META.map((meta) => meta.group);

// ---------------------------------------------------------------------------
// buildNavModel
// ---------------------------------------------------------------------------

test("buildNavModel returns exactly 7 categories, one per TOOL_GROUP_META entry", () => {
  const model = buildNavModel();
  assert.equal(model.length, 7, `Expected 7 categories, got ${model.length}`);
  assert.deepEqual(
    model.map((c) => c.group).sort(),
    [...EXPECTED_GROUPS].sort(),
  );
});

test("buildNavModel's per-category tool lists exactly mirror TOOL_CATALOG's current group assignments", () => {
  const model = buildNavModel();
  const byGroup = Object.fromEntries(model.map((c) => [c.group, c]));

  for (const group of EXPECTED_GROUPS) {
    const expectedSlugs = TOOL_CATALOG.filter((t) => t.group === group)
      .map((t) => t.slug)
      .sort();
    const actualSlugs = byGroup[group].tools.map((t) => t.slug).sort();
    assert.deepEqual(
      actualSlugs,
      expectedSlugs,
      `Category "${group}" tool list doesn't match TOOL_CATALOG`,
    );
  }

  // Every tool appears in exactly one category, and the total count across
  // all 7 categories equals the full catalog (no tool dropped or duplicated).
  const allSlugsInModel = model.flatMap((c) => c.tools.map((t) => t.slug));
  assert.equal(allSlugsInModel.length, TOOL_CATALOG.length);
  assert.equal(
    new Set(allSlugsInModel).size,
    TOOL_CATALOG.length,
    "Every tool slug should appear exactly once across the nav model",
  );
});

test("buildNavModel's href for each tool/category is well-formed", () => {
  const model = buildNavModel();
  for (const category of model) {
    assert.equal(category.href, `/tools/category/${category.group}`);
    for (const tool of category.tools) {
      assert.equal(tool.href, `/tools/${tool.slug}`);
    }
  }
});

test("buildNavModel supports a translateToolLabel/translateGroupLabel override", () => {
  const model = buildNavModel({
    translateToolLabel: (tool) => (tool.slug === "bmi" ? "BMI Calculator" : null),
    translateGroupLabel: (meta) =>
      meta.group === "health-assessment" ? "Health Self-Assessment" : null,
  });
  const healthCategory = model.find((c) => c.group === "health-assessment");
  assert.equal(healthCategory.label, "Health Self-Assessment");
  const bmi = healthCategory.tools.find((t) => t.slug === "bmi");
  assert.equal(bmi.label, "BMI Calculator");
  // Untranslated tools in the same category fall back to navLabel/title.
  const other = healthCategory.tools.find((t) => t.slug !== "bmi");
  assert.ok(other.label.length > 0);
});

// ---------------------------------------------------------------------------
// buildFooterModel
// ---------------------------------------------------------------------------

test("buildFooterModel returns exactly 4 blocks: overview, categories, guides, civic-partners", () => {
  const model = buildFooterModel();
  assert.equal(model.length, 4, `Expected 4 footer blocks, got ${model.length}`);
  assert.deepEqual(
    model.map((b) => b.id),
    ["overview", "categories", "guides", "civic-partners"],
  );
});

test("buildFooterModel's categories block lists the 7 categories, not individual tools", () => {
  const model = buildFooterModel();
  const categoriesBlock = model.find((b) => b.id === "categories");
  assert.equal(categoriesBlock.links.length, 7);

  // No link in this block should be an individual tool page
  // (/tools/<slug>) — only /tools/category/<slug>.
  for (const link of categoriesBlock.links) {
    assert.ok(
      link.href.startsWith("/tools/category/"),
      `Footer categories block must not contain an individual tool link, got: ${link.href}`,
    );
  }

  const linkedGroups = categoriesBlock.links
    .map((l) => l.href.replace("/tools/category/", ""))
    .sort();
  assert.deepEqual(linkedGroups, [...EXPECTED_GROUPS].sort());
});

test("buildFooterModel contains no individual /tools/<slug> tool links anywhere", () => {
  const model = buildFooterModel();
  const toolSlugs = new Set(TOOL_CATALOG.map((t) => t.slug));
  for (const block of model) {
    for (const link of block.links) {
      if (!link.href.startsWith("/tools/")) continue;
      const afterPrefix = link.href.slice("/tools/".length);
      assert.ok(
        afterPrefix.startsWith("category/"),
        `Footer link ${link.href} in block "${block.id}" looks like an individual tool link`,
      );
      // Belt-and-suspenders: make sure it's not literally a bare tool slug.
      assert.ok(!toolSlugs.has(afterPrefix));
    }
  }
});

test("buildFooterModel's overview block has the 5 expected static links", () => {
  const model = buildFooterModel();
  const overview = model.find((b) => b.id === "overview");
  assert.deepEqual(
    overview.links.map((l) => l.href),
    ["/", "/news", "/privacy", "/accessibility", "/llm-info"],
  );
});

test("buildFooterModel's guides block links to all 6 GUIDES", () => {
  const model = buildFooterModel();
  const guidesBlock = model.find((b) => b.id === "guides");
  assert.equal(guidesBlock.links.length, 6);
  const hrefs = guidesBlock.links.map((l) => l.href).sort();
  assert.deepEqual(
    hrefs,
    GUIDES.map((g) => `/guides/${g.slug}`).sort(),
  );
});

test("buildFooterModel's civic-partners block has the existing 9 links as valid HTTPS URLs", () => {
  const model = buildFooterModel();
  const civicBlock = model.find((b) => b.id === "civic-partners");
  assert.equal(civicBlock.links.length, 9);
  assert.equal(CIVIC_PARTNER_LINKS.length, 9);

  for (const link of civicBlock.links) {
    assert.doesNotThrow(() => new URL(link.href));
    assert.ok(link.href.startsWith("https://"));
  }

  // The original 7 hosts transcribed from the two now-superseded duplicated
  // sources (see navModel.ts's doc comment) plus the 2 anti-fraud/anti-drug
  // resources added by issue #575.
  const expectedHosts = [
    "g0v.tw",
    "kuma-academy.org",
    "cw.yueyuknows.com",
    "metawilo.com",
    "www.sports.gov.tw",
    "ma.mohw.gov.tw",
    "council2026.taiwangogo.tw",
    "165.npa.gov.tw",
    "antidrug.moj.gov.tw",
  ].sort();
  const actualHosts = civicBlock.links.map((l) => new URL(l.href).hostname).sort();
  assert.deepEqual(actualHosts, expectedHosts);
});

// ---------------------------------------------------------------------------
// buildCategoryPage
// ---------------------------------------------------------------------------

test("buildCategoryPage returns a full model for every valid group slug", () => {
  for (const meta of TOOL_GROUP_META) {
    const page = buildCategoryPage(meta.group);
    assert.ok(page, `buildCategoryPage(${meta.group}) should not be null`);
    assert.equal(page.group, meta.group);
    assert.equal(page.label, meta.labelDefault);
    assert.ok(
      typeof page.description === "string" && page.description.trim().length > 0,
      `Category "${meta.group}" is missing a description`,
    );

    const expectedSlugs = TOOL_CATALOG.filter((t) => t.group === meta.group)
      .map((t) => t.slug)
      .sort();
    assert.deepEqual(page.tools.map((t) => t.slug).sort(), expectedSlugs);

    for (const tool of page.tools) {
      assert.ok(typeof tool.title === "string" && tool.title.length > 0);
      assert.ok(
        typeof tool.directAnswer === "string" && tool.directAnswer.length > 0,
      );
    }
  }
});

test("buildCategoryPage returns null for an invalid group slug", () => {
  assert.equal(buildCategoryPage("not-a-real-group"), null);
  assert.equal(buildCategoryPage(""), null);
  assert.equal(buildCategoryPage("calculator"), null); // old pre-#442 group name
});

// ---------------------------------------------------------------------------
// getRelatedTools (issue #464: related-tools auto-fill)
// ---------------------------------------------------------------------------

test("getRelatedTools returns at least 4 tools for every one of the 79 catalog entries", () => {
  for (const tool of TOOL_CATALOG) {
    const related = getRelatedTools(tool.slug);
    assert.ok(
      related.length >= 4,
      `"${tool.slug}" only has ${related.length} related tools, expected >= 4`,
    );
  }
});

test("getRelatedTools puts curated relatedSlugs first, in their original order", () => {
  for (const tool of TOOL_CATALOG) {
    const related = getRelatedTools(tool.slug);
    const curatedResolved = tool.relatedSlugs.filter((s) =>
      TOOL_CATALOG.some((t) => t.slug === s),
    );
    // Dedupe curatedResolved the same way getRelatedTools does, to compare
    // like for like.
    const dedupedCurated = [...new Set(curatedResolved)]
      .filter((s) => s !== tool.slug)
      .slice(0, 4); // getRelatedTools' default limit caps curated entries too
    assert.deepEqual(
      related.slice(0, dedupedCurated.length).map((t) => t.slug),
      dedupedCurated,
      `"${tool.slug}"'s curated related tools must appear first, in original order`,
    );
  }
});

test("getRelatedTools' auto-filled entries all come from the same group as the source tool", () => {
  for (const tool of TOOL_CATALOG) {
    const related = getRelatedTools(tool.slug);
    const curatedSlugs = new Set(tool.relatedSlugs);
    const autoFilled = related.filter((t) => !curatedSlugs.has(t.slug));
    for (const t of autoFilled) {
      assert.equal(
        t.group,
        tool.group,
        `auto-filled tool "${t.slug}" for "${tool.slug}" must share its group`,
      );
    }
  }
});

test("getRelatedTools never returns duplicates and never includes the tool itself", () => {
  for (const tool of TOOL_CATALOG) {
    const related = getRelatedTools(tool.slug);
    const slugs = related.map((t) => t.slug);
    assert.equal(
      new Set(slugs).size,
      slugs.length,
      `"${tool.slug}"'s related list has duplicates: ${slugs.join(", ")}`,
    );
    assert.ok(
      !slugs.includes(tool.slug),
      `"${tool.slug}"'s related list must not include itself`,
    );
  }
});

test("getRelatedTools caps at the requested limit (default 4) even with a longer curated list", () => {
  const longTermCare = TOOL_CATALOG.find((t) => t.slug === "long-term-care");
  assert.ok(longTermCare, "expected the long-term-care catalog entry to exist");
  assert.ok(
    longTermCare.relatedSlugs.length > 4,
    "this test expects a tool whose curated relatedSlugs already exceeds 4",
  );
  const related = getRelatedTools("long-term-care");
  assert.equal(related.length, 4);
  assert.deepEqual(
    related.map((t) => t.slug),
    longTermCare.relatedSlugs.slice(0, 4),
  );
});

test("getRelatedTools returns [] for an unknown slug instead of throwing", () => {
  assert.doesNotThrow(() => getRelatedTools("not-a-real-tool"));
  assert.deepEqual(getRelatedTools("not-a-real-tool"), []);
});

test("getRelatedTools gracefully handles a limit larger than the available pool instead of throwing", () => {
  // With an enormous limit, the result can never exceed the tool's entire
  // "available pool": its own unique, resolved curated entries (which may
  // legitimately include cross-group tools, e.g. "mental-health" curates
  // "stress"/"sleep" from medical-care even though those happen to also be
  // medical-care) plus every *other* same-group tool not already curated.
  // This independently recomputes that pool size (rather than assuming
  // every curated slug shares the tool's own group) so the assertion holds
  // regardless of any given tool's curation.
  for (const tool of TOOL_CATALOG) {
    const hugeLimit = TOOL_CATALOG.length + 100;
    assert.doesNotThrow(() => getRelatedTools(tool.slug, hugeLimit));
    const related = getRelatedTools(tool.slug, hugeLimit);

    const curatedResolved = [
      ...new Set(
        tool.relatedSlugs.filter(
          (s) => s !== tool.slug && TOOL_CATALOG.some((t) => t.slug === s),
        ),
      ),
    ];
    const sameGroupOthers = TOOL_CATALOG.filter(
      (t) => t.group === tool.group && t.slug !== tool.slug,
    ).map((t) => t.slug);
    const pool = new Set([...curatedResolved, ...sameGroupOthers]);

    assert.equal(
      related.length,
      pool.size,
      `"${tool.slug}" with a huge limit should return its full available pool (${pool.size}), got ${related.length}`,
    );
  }
});

test("getRelatedTools is a pure function: repeated calls return equivalent results", () => {
  const first = getRelatedTools("bmi");
  const second = getRelatedTools("bmi");
  assert.deepEqual(first.map((t) => t.slug), second.map((t) => t.slug));
});

test("getRelatedTools doesn't throw and returns whatever's available when the tool's own group (including itself) has fewer than 4 total members", () => {
  // No real TOOL_GROUP_META group is this small today (min is 9), so this
  // exercises the edge case the acceptance criteria calls out via the
  // optional injectable `catalog` parameter instead of real data.
  const makeTool = (slug, group, relatedSlugs = []) => ({
    slug,
    title: slug,
    navLabel: slug,
    description: slug,
    keywords: [slug],
    directAnswer: slug,
    scientificBasis: [],
    relatedSlugs,
    faqs: [],
    group,
  });

  const tinyCatalog = [
    makeTool("tiny-a", "tiny-group", []),
    makeTool("tiny-b", "tiny-group", []),
    makeTool("other-x", "other-group", []),
  ];

  // "tiny-group" only has 2 members total (tiny-a, tiny-b), so tiny-a can
  // never reach 4 related tools no matter how it auto-fills — it should
  // just return the 1 other same-group tool, not throw.
  assert.doesNotThrow(() => getRelatedTools("tiny-a", 4, tinyCatalog));
  const related = getRelatedTools("tiny-a", 4, tinyCatalog);
  assert.deepEqual(related.map((t) => t.slug), ["tiny-b"]);

  // A tool whose group has no other members at all (solo group) returns [].
  const soloCatalog = [
    ...tinyCatalog,
    makeTool("solo", "solo-group", []),
  ];
  assert.doesNotThrow(() => getRelatedTools("solo", 4, soloCatalog));
  assert.deepEqual(getRelatedTools("solo", 4, soloCatalog), []);
});

// ---------------------------------------------------------------------------
// buildRedirects
// ---------------------------------------------------------------------------

test("buildRedirects returns CATALOG_REDIRECTS and every entry's destination resolves to a real tool", () => {
  const redirects = buildRedirects();
  assert.equal(redirects, CATALOG_REDIRECTS);
  assert.ok(redirects.length > 0);

  for (const redirect of redirects) {
    assert.ok(redirect.source.startsWith("/tools/"), redirect.source);
    assert.ok(redirect.destination.startsWith("/tools/"), redirect.destination);
    assert.equal(typeof redirect.permanent, "boolean");

    // Strip the leading "/tools/" and any "?query" to get the bare tool
    // slug, then confirm it's a real, still-existing TOOL_CATALOG entry.
    const destSlug = redirect.destination
      .slice("/tools/".length)
      .split("?")[0];
    assert.doesNotThrow(
      () => getToolCatalogEntry(destSlug),
      `Redirect ${redirect.source} -> ${redirect.destination}: destination slug "${destSlug}" doesn't exist in TOOL_CATALOG`,
    );
  }
});

test("buildRedirects does not include the non-merge /emergency vanity shortcut", () => {
  const redirects = buildRedirects();
  assert.ok(
    !redirects.some((r) => r.source === "/emergency"),
    "/emergency is a vanity alias, not a catalog merge redirect",
  );
});

test("buildRedirects covers every merge-related redirect currently in next.config.js", () => {
  const redirects = buildRedirects();
  const sources = redirects.map((r) => r.source).sort();
  const expectedSources = [
    "/tools/hakka-community",
    "/tools/tax-organizations",
    "/tools/child-welfare-nurseries",
    "/tools/child-welfare-centers",
    "/tools/green-hotels",
    "/tools/green-products",
    "/tools/green-restaurants",
    "/tools/water-level-stations",
    "/tools/reservoir-status",
    "/tools/family-cultural-activities",
    "/tools/carbon-footprint-products",
    "/tools/carbon-footprint-coefficients",
    "/tools/ltc-contracted",
    "/tools/green-shops",
    "/tools/cpc-stations",
    "/tools/home-healthcare",
    "/tools/elder-welfare",
    "/tools/hakka-bogong",
  ].sort();
  assert.deepEqual(sources, expectedSources);
});

// ---------------------------------------------------------------------------
// GUIDES / buildGuide
// ---------------------------------------------------------------------------

test("GUIDES has exactly 6 guides with the expected slugs", () => {
  assert.equal(GUIDES.length, 6);
  assert.deepEqual(
    GUIDES.map((g) => g.slug).sort(),
    [
      "caring-for-elders",
      "pregnancy-to-parenting",
      "typhoon-earthquake",
      "disability-living",
      "travel-health",
      "fraud-and-addiction",
    ].sort(),
  );
});

test("fraud-and-addiction guide has the required step order: anti-fraud -> emergency-hotlines -> mental-health -> smoking-cessation -> clinics", () => {
  const guide = GUIDES.find((g) => g.slug === "fraud-and-addiction");
  assert.ok(guide, "expected a fraud-and-addiction guide in GUIDES");
  assert.deepEqual(
    guide.steps.map((s) => s.toolSlug),
    ["anti-fraud", "emergency-hotlines", "mental-health", "smoking-cessation", "clinics"],
  );
});

test("caring-for-elders guide includes an anti-fraud step", () => {
  const guide = GUIDES.find((g) => g.slug === "caring-for-elders");
  assert.ok(guide, "expected a caring-for-elders guide in GUIDES");
  assert.ok(
    guide.steps.some((s) => s.toolSlug === "anti-fraud"),
    "caring-for-elders should include an anti-fraud step",
  );
});

test("every GUIDES step's toolSlug resolves to a real TOOL_CATALOG entry", () => {
  for (const guide of GUIDES) {
    assert.ok(guide.steps.length > 0, `Guide "${guide.slug}" has no steps`);
    for (const step of guide.steps) {
      assert.doesNotThrow(
        () => getToolCatalogEntry(step.toolSlug),
        `Guide "${guide.slug}" step toolSlug "${step.toolSlug}" does not exist in TOOL_CATALOG`,
      );
      assert.ok(
        typeof step.caption === "string" && step.caption.trim().length > 0,
        `Guide "${guide.slug}" step "${step.toolSlug}" missing caption`,
      );
      assert.ok(
        typeof step.why === "string" && step.why.trim().length > 0,
        `Guide "${guide.slug}" step "${step.toolSlug}" missing why`,
      );
      // Standing content rule: no persona labels, plain "使用者" instead.
      assert.ok(!step.why.includes("觀光客"), step.why);
      assert.ok(!step.why.includes("病患"), step.why);
      assert.ok(!step.caption.includes("觀光客"), step.caption);
      assert.ok(!step.caption.includes("病患"), step.caption);
    }
  }
});

test("every guide has at least 2 FAQs with non-empty question/answer, no persona labels", () => {
  for (const guide of GUIDES) {
    assert.ok(
      guide.faqs.length >= 2,
      `Guide "${guide.slug}" should have at least 2 FAQs, got ${guide.faqs.length}`,
    );
    for (const faq of guide.faqs) {
      assert.ok(faq.question.trim().length > 0);
      assert.ok(faq.answer.trim().length > 0);
      assert.ok(!faq.answer.includes("觀光客"));
      assert.ok(!faq.answer.includes("病患"));
    }
  }
});

test("accessible-transit intentionally appears in two different guides", () => {
  const guidesWithAccessibleTransit = GUIDES.filter((g) =>
    g.steps.some((s) => s.toolSlug === "accessible-transit"),
  ).map((g) => g.slug);
  assert.deepEqual(
    guidesWithAccessibleTransit.sort(),
    ["caring-for-elders", "disability-living"].sort(),
  );
});

test("buildGuide resolves every step's tool and href for all 6 guides", () => {
  for (const guide of GUIDES) {
    const page = buildGuide(guide.slug);
    assert.ok(page, `buildGuide("${guide.slug}") should not be null`);
    assert.equal(page.slug, guide.slug);
    assert.equal(page.title, guide.title);
    assert.equal(page.steps.length, guide.steps.length);
    assert.equal(page.faqs, guide.faqs);

    for (const [i, step] of page.steps.entries()) {
      assert.equal(step.toolSlug, guide.steps[i].toolSlug);
      // issue #590 (parent #583): a step whose real content moved to a
      // nested sub-route (e.g. the typhoon-earthquake guide's earthquake
      // step, now toolSlug "global-watch") declares `hrefOverride` to point
      // there instead of the default `/tools/<toolSlug>` — buildGuide must
      // prefer it when present.
      assert.equal(step.href, guide.steps[i].hrefOverride ?? `/tools/${step.toolSlug}`);
      assert.equal(step.tool.slug, step.toolSlug);
      assert.ok(step.tool.title.length > 0);
    }
  }
});

test("buildGuide returns null for an unknown guide slug", () => {
  assert.equal(buildGuide("not-a-real-guide"), null);
  assert.equal(buildGuide(""), null);
});

test("buildGuide is a pure function: repeated calls return equivalent results", () => {
  const first = buildGuide("typhoon-earthquake");
  const second = buildGuide("typhoon-earthquake");
  assert.deepEqual(
    first.steps.map((s) => s.toolSlug),
    second.steps.map((s) => s.toolSlug),
  );
});
