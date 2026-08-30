import Link from "next/link";
import LocalizedText from "@/components/ui/LocalizedText";
import { type NewsListItem } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { getSourceBadgeStyle } from "@/lib/server/news/sourceCategories";
import { toTaipei, excerpt, calcReadingTime, displayDate } from "@/lib/format/news";
import CardThumb from "@/components/News/CardThumb";

export default function NewsCard({
  item,
  horizontal = false,
  compact = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  isExternal = false,
}: {
  item: NewsListItem;
  featured?: boolean;
  horizontal?: boolean;
  compact?: boolean;
  sizes?: string;
  isExternal?: boolean;
}) {
  const authorLabel = resolveAuthorLabel(item);
  const badgeStyle = getSourceBadgeStyle(item.source_name);
  const isExternalLink =
    isExternal ||
    item.id < 0 ||
    item.source_name === "blog_j172" ||
    Boolean(item.canonical_url && /^https?:\/\//i.test(item.canonical_url) && item.id < 0);
  const href = isExternalLink && item.canonical_url ? item.canonical_url : `/news/${item.id}`;
  const externalProps = isExternalLink ? { target: "_blank", rel: "noopener noreferrer" } : {};

  if (horizontal) {
    return (
      <article className="group btn-press flex items-center gap-3.5 rounded-xl p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <Link
          href={href}
          className="relative h-16 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800"
          tabIndex={-1}
          aria-hidden="true"
          {...externalProps}
        >
          <CardThumb item={item} sizes="80px" />
        </Link>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-xs leading-snug font-semibold text-slate-800 transition-colors group-hover:text-indigo-600 dark:text-slate-200 dark:group-hover:text-indigo-400">
            <Link href={href} {...externalProps}>
              <LocalizedText>{item.title}</LocalizedText>
            </Link>
          </h3>
          <p className="mt-1 text-[11px] text-slate-400">
            {toTaipei(displayDate(item))}
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="group btn-press flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-slate-950/40">
      <Link
        href={href}
        className="block flex-shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800"
        tabIndex={-1}
        aria-hidden="true"
        {...externalProps}
      >
        <div className="relative aspect-[16/10] overflow-hidden">
          <CardThumb item={item} sizes={sizes} />
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wider uppercase ${badgeStyle.bg} ${badgeStyle.text}`}
            >
              {item.feed_name}
            </span>
            {item.location_name ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                📍 {item.location_name}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <span>{toTaipei(displayDate(item))}</span>
            <span aria-hidden="true">•</span>
            <span className="inline-flex items-center gap-1">
              <svg
                className="h-3 w-3 shrink-0 opacity-70"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 15" />
              </svg>
              <span>{calcReadingTime(item.description_html)} 分鐘閱讀</span>
            </span>
          </div>
        </div>

        <h2 className="mt-3 line-clamp-2 text-base leading-snug font-bold tracking-tight text-slate-900 transition-colors duration-200 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
          <Link href={href} {...externalProps}>
            <LocalizedText>{item.title}</LocalizedText>
          </Link>
        </h2>

        {!compact && (
          <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {excerpt(item.description_html, 95)}
          </p>
        )}

        <div
          className={`flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800 ${compact ? "mt-3" : "mt-4"}`}
        >
          <span className="truncate font-medium text-slate-600 dark:text-slate-400">
            {authorLabel}
          </span>
          <Link
            href={href}
            className="font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            {...externalProps}
          >
            閱讀全文 →
          </Link>
        </div>
      </div>
    </article>
  );
}
