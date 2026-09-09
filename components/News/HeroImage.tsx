"use client";

import { useState } from "react";
import Image from "next/image";
import ImageSkeleton from "@/components/ui/ImageSkeleton";
import type { HeroImageAttribution } from "@/lib/server/news/heroImage";

const PROVIDER_LABELS: Record<HeroImageAttribution["provider"], string> = {
  pixabay: "Pixabay",
  pexels: "Pexels",
  unsplash: "Unsplash",
};

/**
 * News article hero image — a client component (needed to track image-load
 * state for the ImageSkeleton shimmer placeholder) used by
 * app/news/[id]/page.tsx in place of a bare <img>.
 */
export default function HeroImage({
  src,
  alt,
  caption,
  attribution,
}: {
  src: string;
  alt: string;
  caption?: string | null;
  /** Photographer/source-page credit for a stock-photo hero — takes priority over `caption` when present. */
  attribution?: HeroImageAttribution | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return null;
  }

  // Scraped article images are hotlinked from arbitrary RSS-source domains
  // (see resolveHeroImage's `/^https?:\/\//` check) -- next.config.js only
  // whitelists cdn.sanity.io/localhost for remote optimization, and adding
  // every possible news-source hostname isn't practical. Only the locally
  // cached stock-photo fallback (pixabay/pexels/unsplash, saved under
  // /images/news/...) can safely go through /_next/image.
  const isExternal = /^https?:\/\//i.test(src);
  const imgClass = `absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out ${loaded ? "opacity-100" : "opacity-0"}`;

  return (
    <figure className="mt-8">
      {/* Fixed aspect box so the skeleton (and the eventual image) always
          occupies real layout space -- previously this div had no intrinsic
          height, so the ImageSkeleton (absolutely positioned) rendered at
          0x0 until the image loaded and the box's height popped in, a CLS
          hit hiding behind the fade transition. */}
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
        {!loaded && <ImageSkeleton className="absolute inset-0" />}
        {isExternal ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            fetchPriority="high"
            onLoad={() => setLoaded(true)}
            onError={() => setHasError(true)}
            className={imgClass}
          />
        ) : (
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(min-width: 896px) 896px, 100vw"
            priority
            onLoad={() => setLoaded(true)}
            onError={() => setHasError(true)}
            className={imgClass}
          />
        )}
      </div>
      {attribution ? (
        <figcaption className="mt-3 text-center text-xs text-slate-400">
          <a
            href={attribution.sourcePageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-indigo-500 hover:underline dark:hover:text-indigo-400"
          >
            Photo by {attribution.contributorName || "Unknown"} on {PROVIDER_LABELS[attribution.provider]}
          </a>
        </figcaption>
      ) : caption ? (
        <figcaption className="mt-3 text-center text-xs text-slate-400">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
