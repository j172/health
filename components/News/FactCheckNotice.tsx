import { getFactCheckNotice } from "@/lib/server/news/sourceCategories";

/**
 * 「來源：XXX（查核機構，非本站判定）」 marker for news cards from a
 * fact-checking organisation (issue #701). Renders nothing for every other
 * source, so callers can drop it in unconditionally.
 *
 * It states who made the judgement and nothing else — the site never restates
 * or re-interprets a 「錯誤／誤導」 verdict, and the marker is independent of
 * the (truncated) summary so a cut-off excerpt can't make a rumour headline
 * read as the site's own statement.
 */
export default function FactCheckNotice({
  sourceName,
  sourceLabel,
  onDark = false,
  className = "",
}: {
  sourceName: string | null | undefined;
  /** The card's resolved publisher label (resolveAuthorLabel). */
  sourceLabel: string;
  /** Use on a dark photo overlay (HeroPost's primary card). */
  onDark?: boolean;
  className?: string;
}) {
  const text = getFactCheckNotice(sourceName, sourceLabel);
  if (!text) return null;
  const tone = onDark
    ? "border-amber-300/60 bg-amber-300/15 text-amber-100"
    : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200";
  return (
    <p
      data-factcheck-notice=""
      className={`inline-block max-w-full rounded-md border px-2 py-0.5 text-[11px] leading-snug font-semibold ${tone} ${className}`.trim()}
    >
      {text}
    </p>
  );
}
