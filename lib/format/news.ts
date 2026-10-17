// Client-safe formatting helpers shared by news/reading UI (NewsCard, HeroPost,
// NewsSidebar, SearchModal). No server-only imports here — these run in
// client components.

/**
 * Decodes numeric character references (`&#x9752;`, `&#38738;`) that stand for
 * a non-ASCII character. 台灣事實查核中心's WordPress feed (issue #701) writes
 * every CJK character of its <description> excerpt this way inside CDATA, where
 * nothing decodes it, so the raw text reached the cards as "&#x9752;&#x5E74;…".
 * References to ASCII/control characters are deliberately left untouched, so
 * this can never turn `&#60;script&#62;` into live markup.
 */
export const decodeNonAsciiCharRefs = (text: string): string =>
  text.replace(/&#(x[0-9a-f]+|\d+);/gi, (match, ref: string) => {
    const code = /^x/i.test(ref) ? parseInt(ref.slice(1), 16) : parseInt(ref, 10);
    if (!Number.isFinite(code) || code < 0xa0 || code > 0x10ffff) return match;
    if (code >= 0xd800 && code <= 0xdfff) return match; // lone surrogate
    return String.fromCodePoint(code);
  });

/** Strips HTML tags and collapses whitespace down to a single line of plain text. */
export const stripHtml = (html: string | null | undefined): string =>
  decodeNonAsciiCharRefs((html ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/**
 * The "〈標題〉這篇文章最早發佈於《站名》。" line a WordPress feed-footer plugin
 * appends to every excerpt (台灣事實查核中心 does). It repeats the title and
 * would otherwise eat the card's whole character budget.
 */
const FEED_FOOTER_RE = /〈[^〉]*〉\s*這篇文章最早發佈於《[^》]*》。?/g;

/** Plain-text excerpt of an HTML string, truncated to `max` characters with an ellipsis. */
export const excerpt = (html: string | null | undefined, max: number): string => {
  const plain = stripHtml(html).replace(FEED_FOOTER_RE, "").replace(/\s+/g, " ").trim();
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

/**
 * The date to show on a card, and the one the list is ordered by:
 * `COALESCE(published_at_utc, first_seen_at_utc)` (issue #92).
 *
 * Eight fetchers hardcode `publishedAtUtc: null`, so their cards used to carry
 * no date at all while still sitting in a list sorted as if they did. Falling
 * back to when the pipeline first saw the item is both the honest answer for
 * those sources and the value the ingestion freshness gate judges age on, so
 * display, sort order and the gate all agree.
 *
 * `display_at_utc` is selected by the news queries; the fallback covers rows
 * built outside them (the blog feed, for one).
 */
export const displayDate = (item: {
  display_at_utc?: Date | string | null;
  published_at_utc?: Date | string | null;
}): Date | string | null => item.display_at_utc ?? item.published_at_utc ?? null;

/** Estimated reading time (minutes) for an HTML article body, based on plain-text length. */
export const calcReadingTime = (html: string | null | undefined): number => {
  const plain = stripHtml(html);
  if (!plain) return 1;
  return Math.max(1, Math.ceil(plain.length / 300));
};
