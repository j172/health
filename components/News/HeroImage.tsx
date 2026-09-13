"use client";

import { useState } from "react";
import Image from "next/image";
import ImageSkeleton from "@/components/ui/ImageSkeleton";
import type { HeroImageAttribution } from "@/lib/server/news/heroImage";

const PROVIDER_LABELS: Record<HeroImageAttribution["provider"], string> = {
  pixabay: "Pixabay",
  pexels: "Pexels",
  unsplash: "Unsplash",
  flickr: "Flickr",
};

/**
 * News article hero image — client component for tracking image-load
 * state and displaying ImageSkeleton shimmer placeholder without CLS.
 * Optimized with Next.js Image (AVIF/WebP, priority, responsive sizes).
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

  const imgClass = `absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out ${loaded ? "opacity-100" : "opacity-0"}`;

  return (
    <figure className="mt-8">
      {/* Fixed aspect box so skeleton and eventual image occupy identical layout space (0 CLS) */}
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
        {!loaded && <ImageSkeleton className="absolute inset-0" />}
        <Image
          src={src}
          alt={alt}
          fill
          priority
          sizes="(min-width: 896px) 896px, 100vw"
          unoptimized={src.startsWith("/images/news/flickr/") || src.endsWith(".svg")}
          onLoad={() => setLoaded(true)}
          onError={() => setHasError(true)}
          className={imgClass}
        />
      </div>
      {attribution ? (
        <figcaption className="mt-3 text-center text-xs text-slate-600">
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
        <figcaption className="mt-3 text-center text-xs text-slate-600">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
