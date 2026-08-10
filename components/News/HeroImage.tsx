"use client";

import { useState } from "react";
import ImageSkeleton from "@/components/ui/ImageSkeleton";

/**
 * News article hero image — a client component (needed to track image-load
 * state for the ImageSkeleton shimmer placeholder) used by
 * app/news/[id]/page.tsx in place of a bare <img>.
 */
export default function HeroImage({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string | null;
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
      {caption ? <figcaption className="mt-3 text-center text-xs text-slate-400">{caption}</figcaption> : null}
    </figure>
  );
}
