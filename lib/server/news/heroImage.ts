import type { NewsAssetItem, NewsDetailItem } from "@/lib/server/news/queries";

export type HeroImageProvider = "pixabay" | "pexels" | "unsplash";

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
   * Unsplash) — required by Unsplash's API Guidelines whenever one of their
   * photos is displayed, and applied to all three providers for consistency
   * (see docs/specs/news-card-image-multi-provider-fallback.md section 3).
   */
  attribution: HeroImageAttribution | null;
}

const STOCK_PHOTO_PROVIDERS: readonly HeroImageProvider[] = ["pixabay", "pexels", "unsplash"];

const isStockPhotoProvider = (value: string | null): value is HeroImageProvider =>
  value !== null && (STOCK_PHOTO_PROVIDERS as readonly string[]).includes(value);

/**
 * Picks the hero image for a news detail page: prefer a scraped article image
 * asset (if one was recorded and has a resolvable http(s) URL), otherwise fall
 * back to the stock photo (Pixabay/Pexels/Unsplash) assigned to the item,
 * otherwise no hero at all.
 */
export function resolveHeroImage(news: NewsDetailItem, assets: NewsAssetItem[]): ResolvedHeroImage | null {
  const heroAsset = assets.find((asset) => asset.asset_type === "image" && /^https?:\/\//i.test(asset.url));
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
