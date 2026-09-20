import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Best-effort on-demand ISR revalidation for a news article page, called by
 * the image-backfill pipelines immediately after they successfully attach a
 * real photo to an article. Fixes the root cause documented in
 * docs/specs/news-article-jsonld-stale-fallback-image.md: `/news/<id>`'s
 * `revalidate = 60` ISR cache only refreshes on the next visit, and a
 * low-traffic article that got the generic per-source fallback image baked
 * into its metadata on first render could otherwise carry that stale
 * `og:image` / NewsArticle `image` forever, even after `card_image_url`
 * becomes correct in the DB.
 *
 * IMPORTANT: `revalidatePath` only works when called from inside an active
 * Next.js Route Handler or Server Action request — it queues onto that
 * request's AsyncLocalStorage-backed work store, and throws "Invariant:
 * static generation store missing" when there is no such store (confirmed
 * against next@16's node_modules/next/dist/server/web/spec-extension/revalidate.js,
 * `revalidate()`: `if (!store || !store.incrementalCache) throw ...`). The
 * image pipeline calls into this from two different contexts:
 *   - POST /api/admin/news-images (app/api/admin/news-images/route.ts) — a
 *     real Route Handler request. This is how the GHA external OG-image
 *     backfill worker (scripts/gha-og-external-backfill.mjs) and the
 *     deploy-time Pixabay backfill loop both attach images, so revalidation
 *     actually fires for those.
 *   - The in-process 10-minute node-cron tick in
 *     lib/server/cron/registerJobs.ts, which calls
 *     assignMissingNewsCardImages() directly with no surrounding request —
 *     revalidatePath throws there, which this function catches and logs.
 *     The shortened `revalidate = 60` fallback on the article page is the
 *     safety net for that path, since it can't get synchronous on-demand
 *     revalidation this way.
 * A revalidation failure must never break the image-backfill run that
 * triggered it, so this never lets the error escape.
 */
export const revalidateArticlePath = (newsItemId: number): void => {
  try {
    revalidatePath(`/news/${newsItemId}`);
  } catch (error) {
    console.error(
      `[revalidateArticlePath] news ${newsItemId}: revalidation skipped (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
  }
};
