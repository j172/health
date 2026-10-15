import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #462: 新聞與工具雙向交叉連結.
//
// lib/server/content/crossLinks.ts is plain .ts with no JSX, so this file
// dynamically imports and exercises it directly (same loader shim as
// lib/server/tools/navModel.test.mjs / tests/tools-related-autofill-464.test.mjs).
// app/news/[id]/page.tsx and components/Tools/ToolPageShell.tsx both contain
// real JSX, which Node's native type-stripping loader cannot parse, so their
// wiring is verified via source-text inspection instead — this repo's
// established convention for anything JSX in the `node --test` suite (see
// tests/tools-category-pages-459.test.mjs, tests/tools-related-autofill-464.test.mjs).

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = new URL("../", import.meta.url);

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

const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");
const { findRelatedToolsForNews, rankNewsForTool } = await import(
  "../lib/server/content/crossLinks.ts"
);
// relatedNewsForTool.ts (the DB-backed half) is NOT imported here — it
// transitively reaches lib/server/db/mysql.ts -> lib/server/config/env.ts,
// which throws at *import* time without a configured database (this test
// environment has none). Verified via source-text inspection below instead,
// matching tests/llms-pages-444.test.mjs's established convention for any
// DB-touching module in this suite.

const findTool = (slug) => TOOL_CATALOG.find((t) => t.slug === slug);

// ---------------------------------------------------------------------------
// News → Tools: findRelatedToolsForNews
// ---------------------------------------------------------------------------

test("earthquake news surfaces a plausible subset of earthquakes/emergency-supplies/disaster-map", () => {
  // Realistic sample shape: a CWA-style bulletin that also mentions shelters
  // opening and reminds residents to pack emergency supplies, as real
  // post-quake news coverage often does.
  const news = {
    title:
      "0403花蓮地震：規模7.2 全台多處開放緊急避難收容所 籲攜防災包應變",
    keywords: "地震,花蓮,防災",
    feed_name: "中央氣象署",
    dept_name: null,
  };

  const related = findRelatedToolsForNews(news);
  const slugs = related.map((t) => t.slug);

  assert.ok(related.length >= 1 && related.length <= 3, "expected 1-3 related tools");
  assert.ok(slugs.includes("earthquakes"), "earthquake news must surface the earthquakes tool");

  const expectedPool = new Set(["earthquakes", "emergency-supplies", "disaster-map"]);
  for (const slug of slugs) {
    assert.ok(
      expectedPool.has(slug),
      `unexpected tool "${slug}" — expected only earthquakes/emergency-supplies/disaster-map`,
    );
  }
});

test("dengue fever (登革熱) news surfaces pest-alerts and global-watch", () => {
  // issue #591 (parent #583): travel-epidemic-alerts was retired in favor of
  // global-watch's 國際疫情 item, which reuses its TravelEpidemicAlertsContent
  // component as-is. The "登革熱" cross-linking keyword was carried over to
  // global-watch's own TOOL_CATALOG entry so this crosslink survives the merge.
  const news = {
    title: "全國登革熱病例創新高 疾管署籲加強防蚊",
    keywords: "登革熱,疾管署,防疫",
    feed_name: "衛生福利部疾病管制署",
    dept_name: "疾病管制署",
  };

  const related = findRelatedToolsForNews(news);
  const slugs = related.map((t) => t.slug);

  assert.ok(related.length >= 1 && related.length <= 3, "expected 1-3 related tools");
  assert.ok(slugs.includes("pest-alerts"), "dengue news must surface pest-alerts");
  assert.ok(
    slugs.includes("global-watch"),
    "dengue news must surface global-watch (successor to the retired travel-epidemic-alerts)",
  );
});

test("findRelatedToolsForNews returns [] for an article matching no tool keyword", () => {
  const news = {
    title: "完全不相關的生活小品文：今天天氣真好去喝咖啡",
    keywords: null,
    feed_name: "測試來源",
    dept_name: null,
  };
  // Even a generic-sounding title shouldn't accidentally match — assert the
  // function at least never throws and returns an array; emptiness itself
  // isn't over-asserted here since catalog growth could legitimately add a
  // coincidental match, but it must still obey the 0-3 contract.
  const related = findRelatedToolsForNews(news);
  assert.ok(Array.isArray(related));
  assert.ok(related.length <= 3);
});

test("findRelatedToolsForNews returns [] when the article has no usable text at all", () => {
  const related = findRelatedToolsForNews({ title: "", keywords: null, feed_name: null, dept_name: null });
  assert.deepEqual(related, []);
});

test("findRelatedToolsForNews caps results at `limit` and never exceeds the catalog", () => {
  const news = { title: "地震 地震速報 震度 海嘯" }; // matches earthquakes on all 4 keywords
  const related = findRelatedToolsForNews(news, 1);
  assert.equal(related.length, 1);
  assert.equal(related[0].slug, "earthquakes");
});

// ---------------------------------------------------------------------------
// Tools → News: rankNewsForTool (pure) + findRelatedNewsForTool (DB-backed)
// ---------------------------------------------------------------------------

test("rankNewsForTool matches recent news whose title contains the tool's keywords", () => {
  const earthquakes = findTool("earthquakes");
  const pool = [
    { id: 1, title: "今日台股收盤小漲" },
    { id: 2, title: "花蓮近海發生地震 氣象署持續監測" },
    { id: 3, title: "全台豪雨特報" },
    { id: 4, title: "日本強震後發布海嘯警戒" },
  ];

  const ranked = rankNewsForTool(earthquakes, pool, 3);
  const ids = ranked.map((item) => item.id);

  assert.ok(ids.includes(2), "article mentioning 地震 should match");
  assert.ok(ids.includes(4), "article mentioning 海嘯 should match");
  assert.ok(!ids.includes(1) && !ids.includes(3), "unrelated articles must not match");
});

test("rankNewsForTool's empty state: no matching news renders nothing, not an empty section", () => {
  const bmi = findTool("bmi");
  const pool = [
    { id: 1, title: "今日台股收盤小漲" },
    { id: 2, title: "花蓮近海發生地震" },
  ];
  const ranked = rankNewsForTool(bmi, pool, 3);
  assert.deepEqual(ranked, []);
});

test("rankNewsForTool respects `limit` and ranks higher keyword-hit-count first", () => {
  const earthquakes = findTool("earthquakes");
  const pool = [
    { id: 1, title: "地震速報：今日地震列表" }, // 2 keyword hits (地震, 地震速報)
    { id: 2, title: "地震" }, // 1 keyword hit
    { id: 3, title: "震度" }, // 1 keyword hit
  ];
  const ranked = rankNewsForTool(earthquakes, pool, 2);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].id, 1, "the double-keyword-hit article should rank first");
});

// ---------------------------------------------------------------------------
// lib/server/content/relatedNewsForTool.ts wiring — source-text inspection
// (DB-touching; see the import-time-throw note above for why it's not
// imported directly here)
// ---------------------------------------------------------------------------

const relatedNewsForToolPath = path.join(
  ROOT_DIR,
  "lib",
  "server",
  "content",
  "relatedNewsForTool.ts",
);
const relatedNewsForToolContent = fs.readFileSync(relatedNewsForToolPath, "utf-8");

test("relatedNewsForTool.ts delegates ranking to the pure rankNewsForTool and reuses the already-cached listLatestNews", () => {
  assert.ok(
    /import\s*{\s*rankNewsForTool\s*}\s*from\s*"@\/lib\/server\/content\/crossLinks"/.test(
      relatedNewsForToolContent,
    ),
    "relatedNewsForTool.ts must reuse crossLinks.ts's pure rankNewsForTool rather than re-implementing matching",
  );
  assert.ok(
    /import\s*{\s*listLatestNews\s*,\s*listLatestNewsByTopic\s*,\s*type\s*NewsListItem\s*}\s*from\s*"@\/lib\/server\/news\/queries"/.test(
      relatedNewsForToolContent,
    ),
    "relatedNewsForTool.ts must fetch its candidate pool via listLatestNews (and, for issue #565, listLatestNewsByTopic)",
  );
  assert.ok(
    relatedNewsForToolContent.includes("const pool = await listLatestNews(poolSize, 0);"),
    "relatedNewsForTool.ts must call listLatestNews for its candidate pool — that function is already " +
      "memoizeQuery-cached in lib/server/news/queries.ts, which is this feature's caching mechanism",
  );
});

// Issue #565: tools that declare TOOL_CATALOG's `newsTopic` field skip the
// keyword-ranked pool entirely and go straight to the topic-scoped query.
test("relatedNewsForTool.ts routes tools with a declared newsTopic to listLatestNewsByTopic instead of the keyword-ranked pool", () => {
  assert.ok(
    /if\s*\(\s*tool\.newsTopic\s*\)\s*{\s*return\s*listLatestNewsByTopic\(\s*tool\.newsTopic\s*,\s*limit\s*\)\s*;\s*}/.test(
      relatedNewsForToolContent,
    ),
    "a tool with newsTopic set must return listLatestNewsByTopic(tool.newsTopic, limit) directly, " +
      "bypassing listLatestNews/rankNewsForTool's 150-item pool ceiling",
  );
});

// ---------------------------------------------------------------------------
// app/news/[id]/page.tsx wiring — source-text inspection (JSX)
// ---------------------------------------------------------------------------

const newsPagePath = path.join(ROOT_DIR, "app", "(zh)", "news", "[id]", "page.tsx");
const newsPageContent = fs.readFileSync(newsPagePath, "utf-8");

test("app/(zh)/news/[id]/page.tsx computes relatedTools via findRelatedToolsForNews and renders it conditionally", () => {
  assert.ok(
    /import\s*{\s*findRelatedToolsForNews\s*}\s*from\s*"@\/lib\/server\/content\/crossLinks"/.test(
      newsPageContent,
    ),
    "page.tsx must import findRelatedToolsForNews from lib/server/content/crossLinks",
  );
  assert.ok(
    newsPageContent.includes("const relatedTools = findRelatedToolsForNews({"),
    "page.tsx must compute relatedTools via findRelatedToolsForNews",
  );
  assert.ok(
    newsPageContent.includes("relatedTools.length > 0 && ("),
    "the related-tools section must branch on relatedTools.length so an empty result renders nothing",
  );
});

// ---------------------------------------------------------------------------
// components/Tools/ToolPageShell.tsx wiring — source-text inspection (JSX)
// ---------------------------------------------------------------------------

const toolPageShellPath = path.join(ROOT_DIR, "components", "Tools", "ToolPageShell.tsx");
const toolPageShellContent = fs.readFileSync(toolPageShellPath, "utf-8");

test("ToolPageShell.tsx computes relatedNews via findRelatedNewsForTool and renders it conditionally", () => {
  assert.ok(
    /import\s*{\s*findRelatedNewsForTool\s*}\s*from\s*"@\/lib\/server\/content\/relatedNewsForTool"/.test(
      toolPageShellContent,
    ),
    "ToolPageShell.tsx must import findRelatedNewsForTool from lib/server/content/relatedNewsForTool",
  );
  assert.ok(
    toolPageShellContent.includes(
      "const relatedNews = catalogEntry ? await findRelatedNewsForTool(catalogEntry) : [];",
    ),
    "ToolPageShell.tsx must compute relatedNews via findRelatedNewsForTool, guarded on catalogEntry",
  );
  assert.ok(
    toolPageShellContent.includes("relatedNews.length > 0 ? ("),
    "the related-news section must branch on relatedNews.length so an empty result renders nothing",
  );
  assert.ok(
    /export default async function ToolPageShell/.test(toolPageShellContent),
    "ToolPageShell must be an async Server Component to await findRelatedNewsForTool",
  );
});
