import Link from "next/link";
import { type NewsListItem } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { getSourceBadgeStyle } from "@/lib/server/news/sourceCategories";
import { toTaipei, excerpt, calcReadingTime } from "@/lib/format/news";
import CardThumb from "@/components/News/CardThumb";

export default function NewsCard({
  item,
  horizontal = false,
  compact = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  item: NewsListItem;
  featured?: boolean;
  horizontal?: boolean;
  compact?: boolean;
  sizes?: string;
}) {
  const authorLabel = resolveAuthorLabel(item);
  const badgeStyle = getSourceBadgeStyle(item.source_name);

  if (horizontal) {
    return (
      <article className="group btn-press flex gap-3.5 items-center p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <Link
          href={`/news/${item.id}`}
          className="relative h-16 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800"
          tabIndex={-1}
          aria-hidden="true"
        >
          <CardThumb item={item} sizes="80px" />
        </Link>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-slate-800 transition-colors group-hover:text-indigo-600 dark:text-slate-200 dark:group-hover:text-indigo-400">
            <Link href={`/news/${item.id}`}>{item.title}</Link>
          </h3>
          <p className="mt-1 text-[11px] text-slate-400">{toTaipei(item.published_at_utc)}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="group btn-press flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-lg dark:hover:shadow-slate-950/40 dark:border-slate-800 dark:bg-slate-900">
      <Link
        href={`/news/${item.id}`}
        className="block flex-shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800"
        tabIndex={-1}
        aria-hidden="true"
      >
        <div className="relative aspect-[16/10] overflow-hidden">
          <CardThumb item={item} sizes={sizes} />
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${badgeStyle.bg} ${badgeStyle.text}`}>
            {item.feed_name}
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <span>{toTaipei(item.published_at_utc)}</span>
            <span aria-hidden="true">•</span>
            <span className="inline-flex items-center gap-1">
              <svg className="h-3 w-3 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 15" />
              </svg>
              <span>{calcReadingTime(item.description_html)} 分鐘閱讀</span>
            </span>
          </div>
        </div>

        <h2 className="mt-3 text-base font-bold leading-snug tracking-tight text-slate-900 transition-colors duration-200 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400 line-clamp-2">
          <Link href={`/news/${item.id}`}>{item.title}</Link>
        </h2>

        {!compact && (
          <p className="mt-2 flex-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {excerpt(item.description_html, 95)}
          </p>
        )}

        <div
          className={`flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs ${compact ? "mt-3" : "mt-4"}`}
        >
          <span className="truncate font-medium text-slate-600 dark:text-slate-400">
            {authorLabel}
          </span>
          <Link
            href={`/news/${item.id}`}
            className="font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            閱讀全文 →
          </Link>
        </div>
      </div>
    </article>
  );
}
