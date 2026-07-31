import Image from "next/image";
import Link from "next/link";
import { type NewsListItem } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { getSourceBadgeStyle } from "@/lib/server/news/sourceCategories";

const stripHtml = (html: string | null | undefined): string =>
  (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const excerpt = (html: string | null | undefined, max = 95): string => {
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

function CardThumb({ item, sizes }: { item: NewsListItem; sizes: string }) {
  const src = item.card_image_url;
  const cls =
    "h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105";

  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 p-4">
        <Image
          src="/images/logo/j172tw-health-logo.png"
          alt="j172tw Healthz"
          width={48}
          height={48}
          className="h-10 w-10 opacity-40 transition-transform duration-500 group-hover:scale-110"
        />
        <span className="mt-2 text-[10px] font-semibold tracking-wider text-slate-400 opacity-60">j172tw Healthz</span>
      </div>
    );
  }

  if (/^https?:\/\//i.test(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={item.title} className={cls} loading="lazy" />;
  }

  return (
    <Image
      src={src}
      alt={item.title}
      fill
      className={cls}
      sizes={sizes}
      unoptimized={src.startsWith("/images/news/pixabay/") || src.startsWith("/images/news/articles/")}
    />
  );
}

const calcReadingTime = (html: string | null | undefined): number => {
  const plain = stripHtml(html);
  if (!plain) return 1;
  return Math.max(1, Math.ceil(plain.length / 300));
};

export default function NewsCard({
  item,
  horizontal = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  item: NewsListItem;
  featured?: boolean;
  horizontal?: boolean;
  sizes?: string;
}) {
  const authorLabel = resolveAuthorLabel(item);
  const badgeStyle = getSourceBadgeStyle(item.source_name);

  if (horizontal) {
    return (
      <article className="group flex gap-3.5 items-center p-2 rounded-xl transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
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
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
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

        <p className="mt-2 flex-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {excerpt(item.description_html)}
        </p>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
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
