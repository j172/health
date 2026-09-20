import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// docs/specs/news-article-jsonld-stale-fallback-image.md: after the
// image-backfill pipeline attaches a real photo to an article, it must call
// revalidateArticlePath() so the article's ISR cache refreshes immediately
// instead of waiting on organic traffic to re-trigger it. This mocks
// next/cache's revalidatePath (a real ISR integration test would need a
// running Next.js server) to verify: (1) it's called with the correct
// `/news/<id>` path, and (2) a failure inside it (e.g. no Route
// Handler/Server Action request context — the documented case for the
// in-process cron tick) never escapes and breaks the caller.

const REPO_ROOT = new URL("../../../", import.meta.url);

const NEXT_CACHE_MOCK_SOURCE = `
export const __mockState = { calls: [], shouldThrow: false };
export function revalidatePath(path) {
  __mockState.calls.push(path);
  if (__mockState.shouldThrow) {
    throw new Error("Invariant: static generation store missing in revalidatePath " + path);
  }
}
`;
const NEXT_CACHE_MOCK_URL = `data:text/javascript,${encodeURIComponent(NEXT_CACHE_MOCK_SOURCE)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    if (specifier === "next/cache") {
      return { url: NEXT_CACHE_MOCK_URL, shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { __mockState } = await import("next/cache");
const { revalidateArticlePath } = await import("./revalidateArticle.ts");

test("revalidateArticlePath calls next/cache's revalidatePath with the correct /news/<id> article path (news id 1014118 — the confirmed live repro in the spec)", () => {
  __mockState.calls.length = 0;
  __mockState.shouldThrow = false;

  revalidateArticlePath(1014118);

  assert.deepEqual(__mockState.calls, ["/news/1014118"]);
});

test("revalidateArticlePath swallows a failing revalidatePath call (e.g. called outside a Route Handler/Server Action request, as from the in-process node-cron tick) instead of throwing", () => {
  __mockState.calls.length = 0;
  __mockState.shouldThrow = true;

  assert.doesNotThrow(() => revalidateArticlePath(999));
  assert.deepEqual(__mockState.calls, ["/news/999"]);
});
