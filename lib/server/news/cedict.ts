import "server-only";
import cedictTerms from "@/lib/server/news/data/cedict-terms.json";

/**
 * Offline Traditional-Chinese -> English lookup used as a middle tier for
 * news-card image search terms (see imageSearchTerms.ts's deriveDictionaryTerm),
 * inserted between the hand-maintained KEYWORD_TERMS regex table and the
 * generic health/life/nature fallback rotation. No API key, no network call,
 * no per-article cost — a title that doesn't match any KEYWORD_TERMS pattern
 * gets a real, specific search term instead of immediately falling into the
 * same 3 overused generic terms that exhaust their provider candidate pools
 * under heavy backfill (see docs/specs/news-card-image-freshness-scheduling.md).
 *
 * data/cedict-terms.json is a prebuilt { traditionalWord: englishGloss } map
 * generated from CC-CEDICT by scripts/build-cedict-terms.mjs (see that
 * script's header for the source/license and regeneration instructions).
 * It's a plain JSON import rather than a runtime file read deliberately —
 * this app's deploy pipeline (.github/workflows/deploy-ftps.yml) only ships
 * the compiled `.next3` build output and `public/`, never the raw `lib/`
 * source tree, so a path like `path.join(process.cwd(), "lib", ...)` read
 * via fs at request time would resolve to nothing in production. A JSON
 * import instead becomes part of the webpack module graph and gets bundled
 * into `.next3` along with the rest of this module's compiled server code.
 */
const cedictMap: Record<string, string> = cedictTerms;

/** Looks up a Traditional Chinese word's shortest usable English gloss, or
 * null if the word isn't in CC-CEDICT or every definition was filtered out
 * as unusable (cross-reference, abbreviation, classifier note, etc.) when
 * data/cedict-terms.json was generated. */
export const lookupChineseWord = (word: string): string | null => cedictMap[word] ?? null;
