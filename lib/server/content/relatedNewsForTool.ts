import type { ToolCatalogEntry } from "@/lib/server/tools/catalog";
import { listLatestNews, listLatestNewsByTopic, type NewsListItem } from "@/lib/server/news/queries";
import { rankNewsForTool } from "@/lib/server/content/crossLinks";

/**
 * Tools → News direction's DB-backed half (issue #462's "工具頁顯示最多 3
 * 則與該工具相關的最新新聞"). Split out from lib/server/content/crossLinks.ts
 * (which holds the pure matching/ranking logic, including `rankNewsForTool`
 * itself) specifically so that file stays importable in this repo's
 * `node --test` suite without a configured database — importing
 * lib/server/news/queries.ts transitively reaches lib/server/db/mysql.ts →
 * lib/server/config/env.ts, which throws at *import* time (not call time)
 * when e.g. MYSQL_HOST isn't set, exactly like the test environment. This
 * file is therefore exercised via source-text inspection in tests rather
 * than imported directly, matching this repo's established convention for
 * any DB-touching module (see tests/llms-pages-444.test.mjs's doc comment).
 *
 * Caching: fetches its candidate pool via `listLatestNews`, which
 * lib/server/news/queries.ts already wraps in `memoizeQuery` (60s TTL,
 * lib/server/cache/memo.ts — the same mechanism every other cached query in
 * this codebase uses). Reusing that existing cached query, instead of adding
 * a second cache here, means every tool page's related-news lookup within
 * the same 60s window shares one cached pool and one real DB query — this
 * scales with "how often the cache expires", not "how many tool pages (or
 * repeat views of the same one) get requested".
 *
 * Issue #565 adds a second path: when `tool.newsTopic` is set (e.g.
 * `mental-health` → "anti-drug", `smoking-cessation` → "tobacco"), this
 * fetches the latest `limit` articles carrying that topic directly via
 * `listLatestNewsByTopic`, instead of keyword-ranking the same 150-item
 * recency pool every other tool uses. A sparse topic can have fewer than
 * `limit` hits inside the most recent 150 articles site-wide on any given
 * day — querying the topic table directly removes that ceiling. Tools
 * without `newsTopic` keep the original pool+rank behavior unchanged.
 */
export async function findRelatedNewsForTool(
  tool: ToolCatalogEntry,
  limit = 3,
  poolSize = 150,
): Promise<NewsListItem[]> {
  if (tool.newsTopic) {
    return listLatestNewsByTopic(tool.newsTopic, limit);
  }
  const pool = await listLatestNews(poolSize, 0);
  return rankNewsForTool(tool, pool, limit);
}
