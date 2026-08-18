"use client";

import { useState } from "react";
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

  return (
    <figure className="mt-8">
      <div className="relative overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
        {!loaded && <ImageSkeleton className="absolute inset-0" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          className={`max-h-[32rem] w-full object-cover transition-opacity duration-300 ease-out ${loaded ? "opacity-100" : "opacity-0"}`}
        />
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
