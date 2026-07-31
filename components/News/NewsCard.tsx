import Image from "next/image";
import Link from "next/link";
import { type NewsListItem } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { bg: string; text: string }> = {
  gov: { bg: "bg-accent-teal/10", text: "text-accent-teal" },
  media: { bg: "bg-accent-blue/10", text: "text-accent-blue" },
};

const AVATAR_COLORS = ["bg-primary", "bg-accent-teal", "bg-accent-blue", "bg-accent-purple"];

function categoryStyle(sourceName: string) {
  const cat = SOURCE_CATEGORIES.find((c) => c.sources.some((s) => s.sourceName === sourceName));
  return (cat && CATEGORY_STYLE[cat.key]) || { bg: "bg-primary/10", text: "text-primary" };
}

function avatarColor(sourceName: string): string {
  let hash = 0;
  for (const ch of sourceName) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const stripHtml = (html: string | null | undefined): string =>
  (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const excerpt = (html: string | null | undefined, max = 90): string => {
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

// ─── Thumbnail ────────────────────────────────────────────────────────────────

function CardThumb({ item, sizes }: { item: NewsListItem; sizes: string }) {
  const src = item.card_image_url;
  const cls =
    "h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]";

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-10 w-10 text-neutral-300" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
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

// ─── Main export ──────────────────────────────────────────────────────────────

export default function NewsCard({
  item,
  featured = false,
  horizontal = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  item: NewsListItem;
  featured?: boolean;
  horizontal?: boolean;
  sizes?: string;
}) {
  const { bg, text } = categoryStyle(item.source_name);
  const authorLabel = resolveAuthorLabel(item);
  const initial = authorLabel.charAt(0).toUpperCase();
  const color = avatarColor(item.source_name);

  if (horizontal) {
    return (
      <article className="group flex gap-3">
        <Link href={`/news/${item.id}`} className="relative h-16 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-neutral-100" tabIndex={-1} aria-hidden="true">
          <CardThumb item={item} sizes="80px" />
        </Link>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-neutral-800 transition-colors group-hover:text-primary">
            <Link href={`/news/${item.id}`}>{item.title}</Link>
          </h3>
          <p className="mt-1 text-[11px] text-neutral-400">{toTaipei(item.published_at_utc)}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex flex-col">
      <Link href={`/news/${item.id}`} className="block flex-shrink-0 overflow-hidden rounded-2xl bg-neutral-100" tabIndex={-1} aria-hidden="true">
        <div className={`relative overflow-hidden ${featured ? "aspect-video" : "aspect-[16/10]"}`}>
          <CardThumb item={item} sizes={sizes} />
        </div>
      </Link>
      <div className="mt-4 flex flex-1 flex-col">
        <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${bg} ${text}`}>
          {item.feed_name}
        </span>
        <h2 className={`mt-2.5 font-bold leading-snug tracking-[-0.02em] text-neutral-900 transition-colors duration-200 group-hover:text-primary ${featured ? "text-[20px]" : "text-[17px]"} line-clamp-2`}>
          <Link href={`/news/${item.id}`}>{item.title}</Link>
        </h2>
        {!featured && (
          <p className="mt-2 line-clamp-2 text-[13.5px] leading-6 text-neutral-500">{excerpt(item.description_html)}</p>
        )}
        <div className="mt-4 flex items-center gap-2.5">
          <span className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${color}`} aria-hidden="true">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-neutral-700">{authorLabel}</p>
            <p className="text-[11.5px] text-neutral-400">{toTaipei(item.published_at_utc)}</p>
          </div>
        </div>
      </div>
    </article>
  );
}
