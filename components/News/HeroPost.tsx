import Link from "next/link";
import { type NewsListItem } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { getSourceBadgeStyle } from "@/lib/server/news/sourceCategories";
import { toTaipei, excerpt, calcReadingTime } from "@/lib/format/news";

export default function HeroPost({
  hero,
  secondary = [],
}: {
  hero: NewsListItem;
  secondary?: NewsListItem[];
}) {
  const authorLabel = resolveAuthorLabel(hero);
  const desc = excerpt(hero.description_html, 140);
  const src = hero.card_image_url;
  const heroBadgeStyle = getSourceBadgeStyle(hero.source_name);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Primary Hero Post (Spans 2 columns on lg) */}
      <article className="group relative overflow-hidden rounded-3xl bg-slate-900 shadow-xl lg:col-span-2 flex flex-col justify-between">
        <div className="relative aspect-[16/10] sm:aspect-[21/10] w-full overflow-hidden">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={hero.title}
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-700" />
          )}
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent" />

          {/* Top Pill */}
          <div className="absolute left-6 top-6">
            <span className={`inline-flex items-center rounded-full ${heroBadgeStyle.heroBg} px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md`}>
              {hero.feed_name}
            </span>
          </div>

          {/* Bottom Overlaid Text Content */}
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
            <h1 className="max-w-3xl text-xl font-extrabold leading-snug text-white sm:text-2xl lg:text-3xl tracking-tight">
              <Link href={`/news/${hero.id}`} className="transition-opacity hover:opacity-90">
                {hero.title}
              </Link>
            </h1>

            {desc && (
              <p className="mt-2.5 line-clamp-2 max-w-2xl text-xs sm:text-sm text-slate-300">
                {desc}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 pt-2 border-t border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">{authorLabel}</span>
                <span>·</span>
                <span>{toTaipei(hero.published_at_utc)}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <svg className="h-3.5 w-3.5 shrink-0 opacity-80" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15 15" />
                  </svg>
                  <span>{calcReadingTime(hero.description_html)} 分鐘閱讀</span>
                </span>
              </div>
              <Link
                href={`/news/${hero.id}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-slate-900 hover:bg-indigo-500 hover:text-white transition-colors"
              >
                閱讀報導 →
              </Link>
            </div>
          </div>
        </div>
      </article>

      {/* Secondary Featured Cards Column (1 column on lg) */}
      <div className="flex flex-col gap-6 lg:col-span-1">
        {secondary.slice(0, 2).map((item) => {
          const itemAuthor = resolveAuthorLabel(item);
          const itemBadgeStyle = getSourceBadgeStyle(item.source_name);
          return (
            <article
              key={item.id}
              className="group relative flex flex-1 flex-col justify-between overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${itemBadgeStyle.bg} ${itemBadgeStyle.text}`}>
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
                <h3 className="mt-3 text-base font-bold leading-snug text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400 line-clamp-2 transition-colors">
                  <Link href={`/news/${item.id}`}>{item.title}</Link>
                </h3>
                <p className="mt-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                  {excerpt(item.description_html, 90)}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-400">
                  {itemAuthor}
                </span>
                <Link
                  href={`/news/${item.id}`}
                  className="font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  閱讀 →
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}