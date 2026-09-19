import type { NewsAssetItem, NewsDetailItem } from "@/lib/server/news/queries";

export type HeroImageProvider = "pixabay" | "pexels" | "unsplash" | "flickr";

export interface HeroImageAttribution {
  contributorName: string | null;
  sourcePageUrl: string;
  provider: HeroImageProvider;
}

export interface ResolvedHeroImage {
  url: string;
  /** Plain-text caption for a real scraped article image (its RSS/OG title) — never combined with `attribution`. */
  caption: string | null;
  /**
   * Photographer/source-page credit for a stock-photo hero (Pixabay/Pexels/
   * Unsplash/Flickr) — required by Unsplash's API Guidelines whenever one of their
   * photos is displayed, and applied to all providers for consistency
   * (see docs/specs/news-card-image-multi-provider-fallback.md section 3).
   */
  attribution: HeroImageAttribution | null;
}

const STOCK_PHOTO_PROVIDERS: readonly HeroImageProvider[] = ["pixabay", "pexels", "unsplash", "flickr"];

const isStockPhotoProvider = (value: string | null): value is HeroImageProvider =>
  value !== null && (STOCK_PHOTO_PROVIDERS as readonly string[]).includes(value);

/**
 * An asset URL usable directly as an `<img>`/`next/image` `src`: either an
 * absolute http(s) URL (hotlinked source images, pre-2026-07-26 data), or a
 * site-relative path starting with a single `/` (locally re-hosted images
 * since commit `9f6f31a`, e.g. `/images/news/articles/article-<hash>.jpg`).
 * Anything else (empty string, protocol-relative `//host/...`, bare filename,
 * etc.) is rejected.
 */
const isRenderableAssetUrl = (url: string): boolean =>
  /^https?:\/\//i.test(url) || (url.startsWith("/") && !url.startsWith("//"));

/**
 * Picks the hero image for a news detail page: prefer a scraped article image
 * asset (if one was recorded and has a resolvable http(s) URL or site-relative
 * path), otherwise fall back to the stock photo (Pixabay/Pexels/Unsplash)
 * assigned to the item, otherwise no hero at all.
 */
export function resolveHeroImage(news: NewsDetailItem, assets: NewsAssetItem[]): ResolvedHeroImage | null {
  const heroAsset = assets.find((asset) => asset.asset_type === "image" && isRenderableAssetUrl(asset.url));
  if (heroAsset) {
    return { url: heroAsset.url, caption: heroAsset.title, attribution: null };
  }

  if (news.card_image_url && isStockPhotoProvider(news.card_image_source)) {
    return {
      url: news.card_image_url,
      caption: null,
      attribution: news.card_image_source_page_url
        ? {
            contributorName: news.card_image_contributor,
            sourcePageUrl: news.card_image_source_page_url,
            provider: news.card_image_source,
          }
        : null,
    };
  }

  return null;
}
