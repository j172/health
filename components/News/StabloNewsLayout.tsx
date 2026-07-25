import Image from "next/image";
import Link from "next/link";
import type { NewsListItem } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";

type Variant = "home" | "archive";

const thumbs = [
  "/images/blog/blog-01.png",
  "/images/blog/blog-02.png",
  "/images/blog/blog-03.png",
  "/images/blog/blog-04.png",
  "/images/blog/blog-05.png",
];

const CardImage = ({ item, fallbackIndex, sizes }: { item: NewsListItem; fallbackIndex: number; sizes: string }) => {
  const source = item.card_image_url || thumbs[fallbackIndex % thumbs.length];
  const imageClassName = "object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]";

  if (/^https?:\/\//i.test(source)) {
    return (
      // External source images intentionally bypass Next Image because their hostnames vary by news source.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={source} alt={item.title} className={`h-full w-full ${imageClassName}`} loading="lazy" />
    );
  }

  return (
    <Image
      src={source}
      alt={item.title}
      fill
      className={imageClassName}
      sizes={sizes}
      unoptimized={source.startsWith("/images/news/pixabay/")}
    />
  );
};

const toTaipei = (value: Date | null): string => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
};

const stripHtml = (html: string | null | undefined): string => {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const excerpt = (value: string | null | undefined, max = 120): string => {
  const plain = stripHtml(value);
  if (!plain) return "此則新聞尚無摘要，請點入查看完整內容。";
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
};

const PostMeta = ({ item }: { item: NewsListItem }) => (
  <div className="mt-2.5 flex items-center gap-1.5 text-[14px] text-neutral-500">
    <span>{resolveAuthorLabel(item)}</span>
    <span>•</span>
    <time>{toTaipei(item.published_at_utc)}</time>
  </div>
);

const PostCard = ({ item, idx, titleClassName = "text-[18px]" }: { item: NewsListItem; idx: number; titleClassName?: string }) => (
  <article className="group cursor-pointer">
    <Link className="block overflow-hidden rounded-none bg-neutral-100" href={`/news/${item.id}`}>
      <div className="relative aspect-[16/10] overflow-hidden">
        <CardImage item={item} fallbackIndex={idx} sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" />
      </div>
    </Link>

    <div className="mt-4">
      <p className="text-[14px] font-medium text-neutral-500">{item.feed_name}</p>
      <h2 className={`mt-2 font-semibold leading-[1.375] tracking-[-0.025em] text-neutral-800 ${titleClassName}`}>
        <Link href={`/news/${item.id}`} className="transition-colors duration-200 group-hover:text-neutral-900">
          {item.title}
        </Link>
      </h2>
      <p className="mt-2 line-clamp-2 text-[15px] leading-6 text-neutral-600">{excerpt(item.description_html)}</p>
      <PostMeta item={item} />
    </div>
  </article>
);

export const StabloHeader = () => (
  <header className="border-b border-neutral-200">
    <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
      <Link href="/" className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900">
        j172tw Health
      </Link>
      <nav className="hidden items-center gap-6 text-sm font-medium text-neutral-500 md:flex">
        <Link href="/" className="transition-colors hover:text-neutral-900">
          Home
        </Link>
        <Link href="/news" className="transition-colors hover:text-neutral-900">
          News
        </Link>
      </nav>
    </div>
  </header>
);

export const StabloFooter = () => (
  <footer className="mt-20 border-t border-neutral-200">
    <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 px-4 py-8 text-sm text-neutral-500 sm:px-6 lg:px-8 md:flex-row md:items-center">
      <p>Copyright © {new Date().getFullYear()} j172tw Health. All rights reserved.</p>
      <div className="flex items-center gap-2">
        <Link href="/" className="transition-colors hover:text-neutral-800">
          Home
        </Link>
        <span>·</span>
        <Link href="/news" className="transition-colors hover:text-neutral-800">
          News
        </Link>
      </div>
    </div>
  </footer>
);

export default function StabloNewsLayout({ items, variant }: { items: NewsListItem[]; variant: Variant }) {
  const featured = items[0];
  const side = items.slice(1, 3);
  const latest = items.slice(3);

  return (
    <div className="min-h-screen bg-white text-neutral-800">
      <StabloHeader />

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        {variant === "home" && featured ? (
          <>
            <section className="grid gap-8 lg:grid-cols-3">
              <article className="group lg:col-span-2">
                <Link className="block overflow-hidden rounded-none bg-neutral-100" href={`/news/${featured.id}`}>
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <CardImage item={featured} fallbackIndex={0} sizes="(max-width: 1024px) 100vw, 66vw" />
                  </div>
                </Link>

                <div className="mt-5">
                  <p className="text-[14px] font-medium text-neutral-500">{featured.feed_name}</p>
                  <h1 className="mt-3 text-[30px] font-semibold leading-[1.2] tracking-[-0.025em] text-neutral-800">
                    <Link href={`/news/${featured.id}`} className="transition-colors duration-200 group-hover:text-neutral-900">
                      {featured.title}
                    </Link>
                  </h1>
                  <p className="mt-3 max-w-3xl text-base leading-6 text-neutral-600">{excerpt(featured.description_html, 200)}</p>
                  <PostMeta item={featured} />
                </div>
              </article>

              <div className="space-y-8">
                {side.map((item, idx) => (
                  <PostCard key={item.id} item={item} idx={idx + 1} titleClassName="text-[24px] leading-[1.2]" />
                ))}
              </div>
            </section>

            <section className="mt-16">
              <div className="mb-8 flex items-end justify-between gap-4">
                <h2 className="text-[30px] font-semibold leading-9 tracking-[-0.025em] text-neutral-800">Latest Stories</h2>
                <Link href="/news" className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900">
                  View all posts →
                </Link>
              </div>

              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {latest.map((item, idx) => (
                  <PostCard key={item.id} item={item} idx={idx + 3} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="mb-10">
              <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.025em] text-neutral-800">News</h1>
              <p className="mt-2 text-[16px] leading-6 text-neutral-800">See all posts we have ever written.</p>
            </section>

            <section className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item, idx) => (
                <PostCard key={item.id} item={item} idx={idx} />
              ))}
            </section>
          </>
        )}
      </main>

      <StabloFooter />
    </div>
  );
}