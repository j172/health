"use client";

import { useState } from "react";
import Image from "next/image";
import { type NewsListItem } from "@/lib/server/news/queries";
import ImageSkeleton from "@/components/ui/ImageSkeleton";
import { getSourcePlaceholderStyle } from "@/lib/server/news/sourcePlaceholder";

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
    // Source-branded, text-only placeholder (no outlet logos — those are
    // third-party trademarks this site has no license to reproduce) rather
    // than the old one-size-fits-all "j172tw Healthz" logo. Purely a
    // rendering-time fallback: card_image_url in the DB stays null, so the
    // backfill cron keeps retrying and swaps in a real image the moment one
    // is found — see sourcePlaceholder.ts's doc comment.
    const { label, isGov } = getSourcePlaceholderStyle(item.source_name);
    const theme = isGov
      ? { bg: "from-emerald-50 to-slate-100 dark:from-emerald-950/40 dark:to-slate-900", text: "text-emerald-600 dark:text-emerald-400" }
      : { bg: "from-indigo-50 to-slate-100 dark:from-indigo-950/40 dark:to-slate-900", text: "text-indigo-600 dark:text-indigo-400" };
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${theme.bg} p-4 text-center`}>
        <span className={`text-sm font-bold tracking-wide ${theme.text}`}>{label}</span>
        <span className="mt-1.5 text-[10px] font-medium tracking-wider text-slate-400 dark:text-slate-500 opacity-70">j172tw Healthz</span>
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
