import { TOOL_CATALOG, type ToolCatalogEntry } from "@/lib/server/tools/catalog";

/**
 * News ↔ Tools bidirectional cross-linking (issue #462, built on TOOL_CATALOG's
 * `keywords` field from issue #441 — see that field's own doc comment in
 * lib/server/tools/catalog.ts, which already names this ticket as its reason
 * to exist).
 *
 * Both directions share one matching primitive: does a tool's short
 * `keywords` tag literally appear inside a piece of news text (the article's
 * title, its own CSV `keywords` tags, or its publisher name)? This mirrors
 * `searchTools()` in catalog.ts (same `toLocaleLowerCase("zh-TW")` normalize
 * + substring-includes check), but deliberately simpler than that function's
 * full multi-field fuzzy search — issue #462 asks for "does this keyword
 * appear in the title" rather than a general search, since a whole sentence
 * rarely substring-matches another whole sentence verbatim.
 *
 * This module is deliberately DB-free (it only ever imports TOOL_CATALOG,
 * a plain in-memory array) so every function in it stays pure and directly
 * unit-testable with synthetic fixtures — including `rankNewsForTool`, half
 * of the Tools → News direction, which a news-fetching caller feeds its own
 * candidate pool into. The half that actually reads the database —
 * `findRelatedNewsForTool` — lives next door in
 * lib/server/content/relatedNewsForTool.ts specifically so importing *this*
 * file never pulls in lib/server/db/mysql.ts (which throws at import time
 * outside a configured DB environment, e.g. this repo's own `node --test`
 * run — see that file's doc comment for the caching rationale).
 *
 * - News → Tools (`findRelatedToolsForNews`) is pure in-memory matching
 *   against the already-loaded TOOL_CATALOG array — no DB, so no caching is
 *   needed, exactly like `searchTools()` itself.
 * - Tools → News (`rankNewsForTool` here + `findRelatedNewsForTool` in
 *   relatedNewsForTool.ts) does need a DB read for its candidate news pool,
 *   which is why that part is split out.
 */

/** The subset of a news row this module's news → tools matching needs —
 * satisfied by both NewsListItem and NewsDetailItem (lib/server/news/queries.ts). */
export interface CrossLinkNewsSource {
  title: string;
  /** CSV tag string, e.g. "登革熱,疾管署,防疫" — NewsDetailItem.keywords. */
  keywords?: string | null;
  feed_name?: string | null;
  dept_name?: string | null;
}

const normalize = (text: string): string => text.toLocaleLowerCase("zh-TW");

/** A tool's cross-link needles: its `keywords` entries, normalized and
 * deduped. Deliberately excludes `title`/`description`/`directAnswer` — full
 * sentences almost never literally recur inside a short news headline, and
 * `keywords` is the field issue #441 built specifically to carry these
 * "news-headline terms" (see its doc comment in catalog.ts). */
const toolNeedles = (tool: ToolCatalogEntry): string[] =>
  Array.from(
    new Set(
      tool.keywords
        .map((keyword) => keyword.trim())
        .filter(Boolean)
        .map(normalize),
    ),
  );

/** Counts how many of `needles` occur as a substring of `haystack`. */
const countNeedleHits = (needles: string[], haystack: string): number => {
  if (!haystack) return 0;
  let hits = 0;
  for (const needle of needles) {
    if (needle && haystack.includes(needle)) hits += 1;
  }
  return hits;
};

// ---------------------------------------------------------------------------
// News → Tools
// ---------------------------------------------------------------------------

/**
 * Finds the TOOL_CATALOG tools most relevant to a news article: every tool
 * whose `keywords` include at least one term that literally appears in the
 * article's own title, CSV `keywords` tags, feed name, or publishing
 * department (a reasonable stand-in for "分類" — this repo's `news_items`
 * table has no dedicated content-category column; `feed_name`/`dept_name`
 * are the closest fields to one), ranked by how many distinct keywords
 * matched (ties keep the tool's original TOOL_CATALOG order, since
 * `Array.prototype.sort` is a stable sort).
 *
 * Returns `[]` when nothing matches — callers should render no section at
 * all in that case, not an empty one (same convention as this ticket's
 * other direction, `findRelatedNewsForTool`).
 *
 * `catalog` defaults to the real `TOOL_CATALOG`; the parameter exists only so
 * tests can exercise this against a small synthetic catalog.
 */
export function findRelatedToolsForNews(
  news: CrossLinkNewsSource,
  limit = 3,
  catalog: ToolCatalogEntry[] = TOOL_CATALOG,
): ToolCatalogEntry[] {
  const haystack = normalize(
    [news.title, news.keywords, news.feed_name, news.dept_name]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" "),
  );
  if (!haystack) return [];

  const scored = catalog
    .map((tool) => ({ tool, score: countNeedleHits(toolNeedles(tool), haystack) }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry) => entry.tool);
}

// ---------------------------------------------------------------------------
// Tools → News
// ---------------------------------------------------------------------------

/**
 * Pure ranking half of the Tools → News direction: scores each item in an
 * already-fetched `newsItems` pool by how many of `tool`'s `keywords`
 * literally appear in that item's title, highest-scoring first (ties keep
 * the pool's own relative order — callers pass it in recency-descending
 * order, so a tie falls back to "most recent"). Drops non-matches entirely
 * and caps at `limit`.
 *
 * Generic over `T extends { title: string }` (rather than hardcoding
 * `NewsListItem`) specifically so this can be exercised directly against
 * small synthetic fixtures in tests, without needing a database or the full
 * NewsListItem shape.
 */
export function rankNewsForTool<T extends { title: string }>(
  tool: ToolCatalogEntry,
  newsItems: readonly T[],
  limit = 3,
): T[] {
  const needles = toolNeedles(tool);
  if (needles.length === 0) return [];

  const scored = newsItems
    .map((item) => ({ item, score: countNeedleHits(needles, normalize(item.title)) }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry) => entry.item);
}
