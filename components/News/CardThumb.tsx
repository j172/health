"use client";

import { useState } from "react";
import Image from "next/image";
import { type NewsListItem } from "@/lib/server/news/queries";
import ImageSkeleton from "@/components/ui/ImageSkeleton";
import { isGovSource } from "@/lib/server/news/sourceCategories";
import ThematicCover from "@/components/News/ThematicCover";

const isStockPhoto = (source: string | null | undefined): boolean =>
  source === "pixabay" ||
  source === "pexels" ||
  source === "unsplash" ||
  source === "flickr";

/**
 * News card thumbnail — client component with image-load tracking,
 * ImageSkeleton shimmer placeholder (0 CLS), and authoritative whitepaper
 * ThematicCover fallback.
 * Uses Next.js Image optimization for both local and external URLs.
 */
export default function CardThumb({
  item,
  sizes,
}: {
  item: NewsListItem;
  sizes: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const src = item.card_image_url;
  const isCompact = sizes === "80px" || sizes.includes("80px");
  const isGov = isGovSource(item.source_name);

  // Decision 6: For official government bulletins, override stock photos with
  // the authoritative whitepaper vector cover, while preserving real article images (news_assets).
  const shouldOverrideWithCover =
    !src || hasError || (isGov && isStockPhoto(item.card_image_source));

  if (shouldOverrideWithCover) {
    return (
      <ThematicCover
        sourceName={item.source_name}
        title={item.title}
        deptName={item.dept_name}
        compact={isCompact}
      />
    );
  }

  const imgClass =
    "h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]";
  const fadeClass = `transition-opacity duration-300 ease-out ${loaded ? "opacity-100" : "opacity-0"}`;

  return (
    <>
      {!loaded && <ImageSkeleton className="absolute inset-0" />}
      <Image
        src={src}
        alt={item.title}
        fill
        className={`${imgClass} ${fadeClass}`}
        sizes={sizes}
        unoptimized={
          src.endsWith(".svg") ||
          src.startsWith("/images/news/maps/") ||
          src.startsWith("/uploads/maps/") ||
          src.startsWith("/images/news/flickr/")
        }
        onLoad={() => setLoaded(true)}
        onError={() => setHasError(true)}
      />
    </>
  );
}
