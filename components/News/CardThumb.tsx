"use client";

import { useState } from "react";
import Image from "next/image";
import { type NewsListItem } from "@/lib/server/news/queries";
import ImageSkeleton from "@/components/ui/ImageSkeleton";
import { getSourcePlaceholderStyle } from "@/lib/server/news/sourcePlaceholder";

/**
 * News card thumbnail — client component with image-load tracking
 * and ImageSkeleton shimmer placeholder (0 CLS).
 * Uses Next.js Image optimization for both local and external URLs.
 */
export default function CardThumb({ item, sizes }: { item: NewsListItem; sizes: string }) {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const src = item.card_image_url;
  const imgClass =
    "h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]";
  const fadeClass = `transition-opacity duration-300 ease-out ${loaded ? "opacity-100" : "opacity-0"}`;

  if (!src || hasError) {
    const { label, isGov } = getSourcePlaceholderStyle(item.source_name);
    const theme = isGov
      ? { bg: "from-emerald-50 to-slate-100 dark:from-emerald-950/40 dark:to-slate-900", text: "text-emerald-600 dark:text-emerald-400" }
      : { bg: "from-indigo-50 to-slate-100 dark:from-indigo-950/40 dark:to-slate-900", text: "text-indigo-600 dark:text-indigo-400" };
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${theme.bg} p-4 text-center`}>
        <span className={`text-sm font-bold tracking-wide ${theme.text}`}>{label}</span>
        <span className="mt-1.5 text-[10px] font-medium tracking-wider text-slate-600 dark:text-slate-500 opacity-70">j172tw Healthz</span>
      </div>
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
