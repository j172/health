import { isGovSource } from "@/lib/server/news/sourceCategories";
import { getSourceLabel } from "@/lib/server/news/sourceLabels";

/**
 * Text-only, source-branded placeholder shown in place of a card thumbnail
 * (CardThumb.tsx) or og:image (app/api/og/news/[sourceName]/route.tsx) when
 * an article has no card_image_url — replacing the previous one-size-fits-
 * all generic "j172tw Healthz" logo. Deliberately text/color only, no
 * outlet logos: those are third-party trademarks this site has no license
 * to reproduce.
 *
 * Colors are the hex equivalents of the same emerald/indigo split
 * getSourceBadgeStyle (sourceCategories.ts) already uses for the source
 * badge pills — kept as plain hex here (rather than Tailwind classes)
 * because the OG image route renders via next/og's ImageResponse, which
 * only understands inline styles, not Tailwind's class names. CardThumb.tsx
 * uses the existing Tailwind classes directly for its own rendering; this
 * module only supplies the label + the semantic "isGov" flag it keys off.
 */
export interface SourcePlaceholderStyle {
  label: string;
  isGov: boolean;
}

export const getSourcePlaceholderStyle = (sourceName: string): SourcePlaceholderStyle => ({
  label: getSourceLabel(sourceName),
  isGov: isGovSource(sourceName),
});

/** Hex equivalents of getSourceBadgeStyle's emerald/indigo split, for contexts (next/og) that can't use Tailwind classes. */
export const PLACEHOLDER_HEX_COLORS = {
  gov: { bgFrom: "#ecfdf5", bgTo: "#f1f5f9", accent: "#059669" },
  media: { bgFrom: "#eef2ff", bgTo: "#f1f5f9", accent: "#4f46e5" },
} as const;
