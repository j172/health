// Client-safe helper for Cloudflare's edge Image Transformations (issue
// #482, blocked-by #454). No server-only imports here — this runs in both
// server and client components.
//
// Scope — deliberately an explicit allowlist, not "everything under
// /images/ except news": issue #482 names exactly 3 fixed-count static
// image categories (Logo, 工具圖示, 生活情境封面圖). Of those, only the
// Logo (`public/images/logo/`) is an actual image file today —
// `app/(zh)/tools/page.tsx`'s TOOL_ICONS are emoji characters in a
// `Record<string, string>`, not image files, so "工具圖示" has nothing to
// migrate; and the life-situation guide hub (#465) hasn't shipped any cover
// image asset yet, so "生活情境封面圖" likewise has nothing to migrate yet.
// Add its real path prefix here (and only here) once such an asset exists —
// do not pre-allow a directory that doesn't exist yet.
//
// News images (`public/images/news/`, plus the Unsplash/Pexels/OG-fetch
// fallback chain in lib/server/images/) are explicitly OUT of scope per the
// issue's acceptance criteria ("新聞圖片維持現有處理方式") — their count
// grows daily and would blow through Cloudflare's free-tier 5,000
// unique-transformations/month budget. They are not in the allowlist below,
// and this module is never imported from components/News/.
//
// 2026-10-14 correction: this was believed to be a dashboard-only toggle
// with no documented Cloudflare API (same situation as Crawler Hints — see
// config/cloudflare/zone-settings.json's `crawlerHints` field) — wrong.
// PATCH /zones/{id}/settings/image_resizing exists and is now managed
// through the usual config-as-code flow (zoneSettings.image_resizing in
// config/cloudflare/zone-settings.json).
//
// Also corrected the same day: `onerror=redirect`'s graceful fallback only
// applies to a transform failing on an image the edge actually reached —
// confirmed live that while the zone-level feature was off, every URL this
// helper built 404'd with a plain Cloudflare error page (including the site
// logo, on every page) instead of falling back to the original image.
// `onerror=redirect` is kept below regardless, for the cases it does cover
// (a genuine transform failure on a present image), but it was never a
// substitute for the zone setting actually being on.

/** The only static-asset path prefixes this ticket allows to be rewritten
 * into a `/cdn-cgi/image/...` edge-transform URL. See the module comment
 * above for why each existing category is or isn't represented here. */
const ALLOWED_PATH_PREFIXES = ["/images/logo/"] as const;

export interface CfImageOptions {
  /** Target width in CSS pixels (pass the display size, or 2x it for retina). */
  width?: number;
  height?: number;
  /** Defaults to "auto" (Cloudflare picks AVIF/WebP/original per the request's Accept header). */
  format?: "auto" | "avif" | "webp" | "json";
  /** 1-100. Omit to use Cloudflare's default. */
  quality?: number;
  fit?: "scale-down" | "contain" | "cover" | "crop" | "pad";
}

/**
 * Whether `path` is one of the fixed, small-count static asset categories
 * this ticket allows Cloudflare's edge Image Transformations to run on.
 * Used both by `cfImageUrl()` itself and by the regression test that checks
 * news-image paths are never allowed through.
 */
export function isAllowedForCfImageTransform(path: string): boolean {
  if (typeof path !== "string" || !path.startsWith("/")) return false;
  // Edge Image Transformations operate on same-zone origin paths; an
  // absolute external URL (Unsplash/Pexels/arbitrary OG source) is never
  // something this helper should touch.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(path)) return false;
  return ALLOWED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Builds a Cloudflare edge Image Transformation URL
 * (`/cdn-cgi/image/<options>/<path>`) for one of the fixed static-asset
 * categories in `ALLOWED_PATH_PREFIXES`, with `onerror=redirect` always
 * included so a transformation failure (including the zone-level feature
 * not being enabled yet — see the module comment) falls back to serving
 * `path` unmodified instead of a broken image.
 *
 * Throws for any path outside the allowlist — in particular, any news
 * image path or remote URL — rather than silently passing it through,
 * so a future call site that pastes in the wrong path fails loudly instead
 * of quietly burning the free transformation budget on unbounded content.
 */
export function cfImageUrl(path: string, options: CfImageOptions = {}): string {
  if (!isAllowedForCfImageTransform(path)) {
    throw new Error(
      `cfImageUrl: "${path}" is not an allowed fixed-static-image path (issue #482). ` +
        `Only ${ALLOWED_PATH_PREFIXES.join(", ")} may be transformed; news images and ` +
        "remote URLs must keep using the existing pipeline unmodified.",
    );
  }

  const parts: string[] = [];
  if (options.width) parts.push(`width=${options.width}`);
  if (options.height) parts.push(`height=${options.height}`);
  parts.push(`format=${options.format ?? "auto"}`);
  if (options.quality) parts.push(`quality=${options.quality}`);
  if (options.fit) parts.push(`fit=${options.fit}`);
  // Safety net (see module comment): same-zone sources only, falls back to
  // the original image on any transformation error.
  parts.push("onerror=redirect");

  return `/cdn-cgi/image/${parts.join(",")}${path}`;
}
