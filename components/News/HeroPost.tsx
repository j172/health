import Link from "next/link";
import { type NewsListItem } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const stripHtml = (html: string | null | undefined): string =>
  (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const excerpt = (html: string | null | undefined, max = 180): string => {
  const plain = stripHtml(html);
  if (!plain) return "";
  return plain.length > max ? `${plain.slice(0, max)}...` : plain;
};

const toTaipei = (value: Date | null): string => {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(
    new Date(value),
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Full-width hero section for the most recent featured article.
 * Shows a background image with gradient overlay, category tag, bold title,
 * description, and a "read more" CTA.
 */
export default function HeroPost({ item }: { item: NewsListItem }) {
  const authorLabel = resolveAuthorLabel(item);
  const desc = excerpt(item.description_html);
  const src = item.card_image_url;
  const hasImg = !!src;

  return (
    <article className="group relative overflow-hidden rounded-3xl bg-neutral-900 shadow-2xl">
      {/* Background */}
      <div className="relative aspect-[4/3] min-h-[320px] sm:aspect-[21/9] sm:min-h-[420px] lg:min-h-[500px]">
        {hasImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={item.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-accent-purple to-accent-blue" />
        )}

        {/* Gradient overlay: bottom-heavy for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />
      </div>

      {/* Content overlaid at bottom */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-6 pb-8 sm:px-10 sm:pb-10 lg:px-14 lg:pb-14">
        {/* Category chip */}
        <span className="inline-flex w-fit items-center rounded-full bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white">
          {item.feed_name}
        </span>

        {/* Title */}
        <h1 className="mt-3 max-w-4xl text-[1.6rem] font-bold leading-tight tracking-[-0.03em] text-white sm:text-[2.2rem] lg:text-[2.8rem]">
          <Link href={`/news/${item.id}`} className="transition-opacity hover:opacity-90">
            {item.title}
          </Link>
        </h1>

        {/* Excerpt */}
        {desc && (
          <p className="mt-3 max-w-2xl line-clamp-2 text-[14px] leading-6 text-white/70 sm:text-[15px]">
            {desc}
          </p>
        )}

        {/* Meta + CTA */}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <span className="text-sm text-white/60">
            <span className="font-medium text-white/80">{authorLabel}</span>
            {item.published_at_utc && <span> &middot; {toTaipei(item.published_at_utc)}</span>}
          </span>
          <Link
            href={`/news/${item.id}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-neutral-900 shadow-sm transition-all hover:bg-primary hover:text-white"
          >
            閱讀全文
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </div>
    </article>
  );
}