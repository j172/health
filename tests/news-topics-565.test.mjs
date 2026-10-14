import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

// Issue #565: 新聞主題標籤 (classifyNewsTopics + 關聯表 + /news?topic= + 依主題
// 取相關新聞). The pure classifier itself is unit-tested in
// lib/server/news/classifyTopics.test.mjs; this file covers the DB-touching
// wiring (schema, persistItems.ts, queries.ts) via source-text inspection —
// this repo's established convention for anything that transitively reaches
// lib/server/db/mysql.ts, which throws at *import* time without a configured
// database (see tests/news-tools-crosslinks-462.test.mjs's doc comment) —
// plus a couple of direct-import assertions against catalog.ts, which is
// plain .ts/no-JSX and safe to import directly.

const ROOT_DIR = process.cwd();
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

// ---------------------------------------------------------------------------
// Schema: news_item_topics table registered, no time column in any key
// ---------------------------------------------------------------------------

test("schema.ts defines news_item_topics with a (news_item_id, topic) key and no time column in any key (issue #565)", () => {
  const schemaContent = fs.readFileSync(path.join(ROOT_DIR, "lib", "server", "db", "schema.ts"), "utf-8");
  assert.ok(schemaContent.includes("CREATE TABLE IF NOT EXISTS news_item_topics"), "schema.ts must define news_item_topics");

  const match = schemaContent.match(/newsItemTopics:\s*`([\s\S]*?)`/);
  assert.ok(match, "schema.ts must export TABLE_DDL.newsItemTopics");
  const ddl = match[1];

  assert.ok(
    /PRIMARY KEY\s*\(news_item_id,\s*topic\)/.test(ddl),
    "news_item_topics' PRIMARY KEY must be (news_item_id, topic), not an auto-increment id",
  );
  // The repo's own lesson (docs/domains/09-database-data-integrity.md): no
  // UNIQUE/PRIMARY KEY on this table may include a time column, or every
  // reclassification re-run would accumulate rows instead of replacing them.
  const keyLines = ddl.match(/^\s*(PRIMARY KEY|UNIQUE KEY).*$/gm) || [];
  assert.ok(keyLines.length > 0, "expected at least one PRIMARY/UNIQUE KEY line");
  for (const line of keyLines) {
    assert.ok(
      !/created_at|updated_at|_at\b/.test(line),
      `news_item_topics key must not include a time column: "${line.trim()}"`,
    );
  }

  const mysqlContent = fs.readFileSync(path.join(ROOT_DIR, "lib", "server", "db", "mysql.ts"), "utf-8");
  assert.ok(
    mysqlContent.includes("TABLE_DDL.newsItemTopics"),
    "mysql.ts's runSchemaMigrations must run TABLE_DDL.newsItemTopics",
  );
});

// ---------------------------------------------------------------------------
// persistItems.ts: the single news writer calls classifyNewsTopics
// ---------------------------------------------------------------------------

test("persistItems.ts (the single news writer) classifies and writes topics on every insert/update, not just on first insert (issue #565)", () => {
  const content = fs.readFileSync(
    path.join(ROOT_DIR, "lib", "server", "rss", "persistItems.ts"),
    "utf-8",
  );
  assert.ok(
    content.includes('import { classifyNewsTopics } from "@/lib/server/news/classifyTopics"'),
    "persistItems.ts must import classifyNewsTopics",
  );
  assert.ok(
    content.includes("await clearAndInsertTopics(upsertResult.insertId, item, now, conn);"),
    "persistItems.ts must call clearAndInsertTopics right after the upsert, using the same insertId as clearAndInsertAssets",
  );
  assert.ok(
    /DELETE FROM news_item_topics WHERE news_item_id = \?/.test(content),
    "clearAndInsertTopics must delete the old topic rows before reinserting — a re-classification can both add and remove topics",
  );
});

// ---------------------------------------------------------------------------
// queries.ts: topic filter composes with group/source, plus the uncapped
// per-topic query used by relatedNewsForTool.ts
// ---------------------------------------------------------------------------

test("queries.ts: buildNewsFilter's topic condition is independent of (can coexist with) the source/group condition (issue #565)", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "lib", "server", "news", "queries.ts"), "utf-8");

  assert.ok(
    content.includes("EXISTS (SELECT 1 FROM news_item_topics nt WHERE nt.news_item_id = n.id AND nt.topic = ?)"),
    "buildNewsFilter must add a topic EXISTS-subquery condition",
  );
  // The topic `if` block must NOT be inside the else-if chain that picks
  // between sourceName / sourceNames / exclude-defaults — it must be its own
  // trailing `if`, immediately following a sibling block's closing brace
  // (an `else if` would read "} else if", never "} if"), so it layers on
  // top regardless of which branch fired.
  assert.ok(
    /\}\s*if \(topic\) \{/.test(content),
    "expected a standalone `if (topic) { ... }` block (sibling of, not nested inside, the source/group if-chain) in buildNewsFilter",
  );

  assert.ok(
    /export const listLatestNews = async \(\s*limit = 50,\s*offset = 0,\s*sourceName\?: string,\s*keyword\?: string,\s*sourceNames\?: string\[\],\s*topic\?: string,/.test(
      content,
    ),
    "listLatestNews must accept a trailing topic? parameter alongside the existing group/source params",
  );
  assert.ok(
    /const \{ whereClause, params \} = buildNewsFilter\(\s*sourceName,\s*keyword,\s*sourceNames,\s*topic,\s*\);/.test(
      content,
    ),
    "listLatestNews must pass topic through to buildNewsFilter",
  );
  assert.ok(
    /export const countNewsItems = async \(\s*sourceName\?: string,\s*keyword\?: string,\s*sourceNames\?: string\[\],\s*topic\?: string,/.test(
      content,
    ),
    "countNewsItems must accept a trailing topic? parameter too, so /news?topic= pagination's total count matches the filtered list",
  );
});

test("queries.ts: listLatestNewsByTopic queries news_item_topics directly, uncapped by the 150-item recency pool (issue #565)", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "lib", "server", "news", "queries.ts"), "utf-8");
  assert.ok(
    content.includes("export const listLatestNewsByTopic = async ("),
    "queries.ts must export listLatestNewsByTopic",
  );
  assert.ok(
    /JOIN news_item_topics nt ON nt\.news_item_id = n\.id AND nt\.topic = \?/.test(content),
    "listLatestNewsByTopic must JOIN news_item_topics directly rather than going through listLatestNews's pool+rank path",
  );
});

// ---------------------------------------------------------------------------
// catalog.ts: newsTopic field + the two declared entries
// ---------------------------------------------------------------------------

test("TOOL_CATALOG: mental-health declares newsTopic anti-drug, smoking-cessation declares tobacco (issue #565)", () => {
  const findTool = (slug) => TOOL_CATALOG.find((t) => t.slug === slug);

  const mentalHealth = findTool("mental-health");
  assert.ok(mentalHealth, "mental-health entry must exist");
  assert.equal(mentalHealth.newsTopic, "anti-drug");

  const smokingCessation = findTool("smoking-cessation");
  assert.ok(smokingCessation, "smoking-cessation entry must exist");
  assert.equal(smokingCessation.newsTopic, "tobacco");

  // #565 must not assume #564's anti-fraud entry exists yet (parallel ticket).
  const antiFraud = findTool("anti-fraud");
  if (antiFraud) {
    assert.ok(
      antiFraud.newsTopic === undefined || antiFraud.newsTopic === "anti-fraud",
      "if an anti-fraud entry exists by the time this runs, this ticket must not have overwritten its newsTopic",
    );
  }

  // Every other entry must be untouched (newsTopic is opt-in, not a default).
  const others = TOOL_CATALOG.filter((t) => t.slug !== "mental-health" && t.slug !== "smoking-cessation");
  const unexpectedlyTagged = others.filter((t) => t.newsTopic !== undefined);
  assert.deepEqual(
    unexpectedlyTagged.map((t) => t.slug),
    [],
    "only mental-health/smoking-cessation (and #564's own anti-fraud entry, handled separately) should declare newsTopic",
  );
});

// ---------------------------------------------------------------------------
// app/(zh)/news/page.tsx: topic search param wiring
// ---------------------------------------------------------------------------

test("app/(zh)/news/page.tsx reads ?topic= independently of ?group= and passes both through to the queries (issue #565)", () => {
  const newsPagePath = path.join(ROOT_DIR, "app", "(zh)", "news", "page.tsx");
  const content = fs.readFileSync(newsPagePath, "utf-8");

  assert.ok(
    content.includes('import { isTopic, type Topic } from "@/lib/server/news/classifyTopics"'),
    "page.tsx must import isTopic/Topic from classifyTopics.ts to validate the raw query param",
  );
  assert.ok(
    /topicParam\?\.trim\(\)/.test(content),
    "page.tsx must read and trim the raw topic search param before validating it",
  );
  assert.ok(
    content.includes("isTopic(trimmedTopic)"),
    "page.tsx must validate the raw topic param against isTopic before using it (never trust the raw query string)",
  );
  assert.ok(
    /listLatestNews\(pageSize, \(currentPage - 1\) \* pageSize, sourceName, keyword, sourceNames, topic\)/.test(content),
    "page.tsx must pass topic through to listLatestNews alongside sourceName/keyword/sourceNames",
  );
  assert.ok(
    /countNewsItems\(sourceName, keyword, sourceNames, topic\)/.test(content),
    "page.tsx must pass topic through to countNewsItems so the pagination total matches the filtered list",
  );
  assert.ok(
    content.includes("group: groupKey, topic }}"),
    "page.tsx must pass topic into the Pagination object so page links preserve it",
  );
});

test("components/News/PaginationBar.tsx preserves ?topic= across page/size links (issue #565)", () => {
  const content = fs.readFileSync(
    path.join(ROOT_DIR, "components", "News", "PaginationBar.tsx"),
    "utf-8",
  );
  assert.ok(content.includes("topic?: string;"), "Pagination interface must declare topic?: string");
  assert.ok(
    content.includes('if (topic) params.set("topic", topic);'),
    "buildUrl must carry the topic param forward on every pagination link",
  );
});

// ---------------------------------------------------------------------------
// Backfill script exists and is clearly a manual one-off (not a cron job)
// ---------------------------------------------------------------------------

test("scripts/backfill-news-topics.mjs exists, defaults to dry-run, and classifies the last ~90 days (issue #565)", () => {
  const scriptPath = path.join(ROOT_DIR, "scripts", "backfill-news-topics.mjs");
  assert.ok(fs.existsSync(scriptPath), "scripts/backfill-news-topics.mjs must exist");
  const content = fs.readFileSync(scriptPath, "utf-8");

  assert.ok(content.includes('getArg("days", "90")'), "script must default to a 90-day backfill window");
  assert.ok(content.includes("const EXECUTE = args.includes(\"--execute\");"), "script must require an explicit --execute flag to write");
  assert.ok(
    content.includes('import("../lib/server/news/classifyTopics.ts")'),
    "script must reuse the real classifyNewsTopics implementation rather than re-deriving rules",
  );
  assert.ok(
    content.includes("DELETE FROM news_item_topics WHERE news_item_id = ?"),
    "script must replace (not just append) a row's topics, same as persistItems.ts's own clearAndInsertTopics",
  );
});
