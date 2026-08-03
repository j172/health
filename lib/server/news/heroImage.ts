import type { NewsAssetItem, NewsDetailItem } from "@/lib/server/news/queries";

export interface ResolvedHeroImage {
  url: string;
  caption: string | null;
  isPixabay: boolean;
}

/**
 * Picks the hero image for a news detail page: prefer a scraped article image
 * asset (if one was recorded and has a resolvable http(s) URL), otherwise fall
 * back to the Pixabay stock photo assigned to the item, otherwise no hero at all.
 */
export function resolveHeroImage(news: NewsDetailItem, assets: NewsAssetItem[]): ResolvedHeroImage | null {
  const heroAsset = assets.find((asset) => asset.asset_type === "image" && /^https?:\/\//i.test(asset.url));
  if (heroAsset) {
    return { url: heroAsset.url, caption: heroAsset.title, isPixabay: false };
  }

  if (news.card_image_url && news.card_image_source === "pixabay") {
    return { url: news.card_image_url, caption: null, isPixabay: true };
  }

  return null;
}
