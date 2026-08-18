"use client";

import { useState } from "react";
import Image from "next/image";
import { type NewsListItem } from "@/lib/server/news/queries";
import ImageSkeleton from "@/components/ui/ImageSkeleton";

/**
 * News card thumbnail — extracted from NewsCard.tsx as its own client
 * component so it can track image-load state (needed to show/hide the
 * ImageSkeleton shimmer placeholder; a plain server-rendered <img>/<Image>
 * has no "loaded" signal to hook into without one).
 */
export default function CardThumb({ item, sizes }: { item: NewsListItem; sizes: string }) {
  const [loaded, setLoaded] = useState(false);
  const src = item.card_image_url;
  const imgClass =
    "h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]";
  const fadeClass = `transition-opacity duration-300 ease-out ${loaded ? "opacity-100" : "opacity-0"}`;

  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 p-4">
        <Image
          src="/images/logo/j172tw-health-logo.png"
          alt="j172tw Healthz"
          width={48}
          height={48}
          className="h-10 w-10 opacity-40 transition-transform duration-300 group-hover:scale-105"
        />
        <span className="mt-2 text-[10px] font-semibold tracking-wider text-slate-400 opacity-60">j172tw Healthz</span>
      </div>
    );
  }

  if (/^https?:\/\//i.test(src)) {
    return (
      <>
        {!loaded && <ImageSkeleton className="absolute inset-0" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={item.title}
          className={`${imgClass} ${fadeClass}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
      </>
    );
  }

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
          src.startsWith("/images/news/pixabay/") ||
          src.startsWith("/images/news/pexels/") ||
          src.startsWith("/images/news/unsplash/") ||
          src.startsWith("/images/news/articles/")
        }
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}
