import type { CSSProperties } from "react";

/**
 * ImageSkeleton — generic "this image hasn't loaded yet" placeholder.
 *
 * A pure-Tailwind shimmer sweep, reusing the `.animate-shimmer` utility /
 * `shimmer` keyframe that already exists in app/globals.css (dark-mode and
 * `prefers-reduced-motion` handling both already live there — see the
 * `.animate-shimmer` rules). Sized to match the image slot it's covering via
 * `width`/`height`/`aspectRatio`; no caption, no label, no resolution text —
 * strictly a loading placeholder.
 *
 * Typical usage: render this absolutely-positioned inside a `relative`
 * container while an `<img>`/`<Image>` loads, then hide it once the image's
 * `onLoad` fires (see components/News/CardThumb.tsx or
 * components/News/HeroImage.tsx for the pattern).
 */
export default function ImageSkeleton({
  width,
  height,
  aspectRatio,
  className = "",
}: {
  /** CSS width; a number is treated as pixels. Defaults to filling the parent. */
  width?: number | string;
  /** CSS height; a number is treated as pixels. Ignored when `aspectRatio` is set. */
  height?: number | string;
  /** e.g. "16/10" — reserves layout space via the CSS `aspect-ratio` property. */
  aspectRatio?: string;
  /** Extra classes, e.g. for corner radius to match the image container it's covering. */
  className?: string;
}) {
  const style: CSSProperties = {
    width: width ?? "100%",
    height: aspectRatio ? undefined : (height ?? "100%"),
    aspectRatio,
  };

  return <div aria-hidden="true" className={`animate-shimmer ${className}`} style={style} />;
}
