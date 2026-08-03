// Client-safe formatting helpers shared by news/reading UI (NewsCard, HeroPost,
// NewsSidebar, SearchModal). No server-only imports here — these run in
// client components.

/** Strips HTML tags and collapses whitespace down to a single line of plain text. */
export const stripHtml = (html: string | null | undefined): string =>
  (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Plain-text excerpt of an HTML string, truncated to `max` characters with an ellipsis. */
export const excerpt = (html: string | null | undefined, max: number): string => {
  const plain = stripHtml(html);
  if (!plain) return "";
  return plain.length > max ? `${plain.slice(0, max)}...` : plain;
};

/** Formats a date/timestamp in the Asia/Taipei timezone using zh-TW locale conventions. */
export const toTaipei = (
  value: Date | string | null,
  dateStyle: "short" | "medium" = "medium",
): string => {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-TW", { dateStyle, timeZone: "Asia/Taipei" }).format(
    new Date(value),
  );
};

/** Estimated reading time (minutes) for an HTML article body, based on plain-text length. */
export const calcReadingTime = (html: string | null | undefined): number => {
  const plain = stripHtml(html);
  if (!plain) return 1;
  return Math.max(1, Math.ceil(plain.length / 300));
};
