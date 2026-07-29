import Image from "next/image";
import Link from "next/link";
import { listActiveWeatherWarnings, type NewsListItem } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { getLatestUvReadings } from "@/lib/server/cwa/queries";
import SiteNav from "@/components/News/SiteNav";

type Variant = "home" | "archive";

// A brief-lived gap only: a newly ingested item shows this until the next
// Pixabay backfill pass assigns it a real image (assignMissingNewsCardImages
// runs after every RSS sync and on every deploy). Previously this fell back
// to leftover "blog-01.png"-style demo photos from the starter template,
// which silently masked items that never got a Pixabay image assigned.
const CardImagePlaceholder = () => (
  <div className="flex h-full w-full items-center justify-center bg-neutral-100">
    <Image src="/images/logo/j172tw-health-logo.png" alt="j172tw Health" width={48} height={48} className="h-12 w-12 opacity-30" />
  </div>
);

const CardImage = ({ item, sizes }: { item: NewsListItem; sizes: string }) => {
  const source = item.card_image_url;
  const imageClassName = "object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]";

  if (!source) {
    return <CardImagePlaceholder />;
  }

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
      unoptimized={source.startsWith("/images/news/pixabay/") || source.startsWith("/images/news/articles/")}
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

const PostCard = ({ item, titleClassName = "text-[18px]" }: { item: NewsListItem; titleClassName?: string }) => (
  <article className="group cursor-pointer">
    <Link className="block overflow-hidden rounded-none bg-neutral-100" href={`/news/${item.id}`}>
      <div className="relative aspect-[16/10] overflow-hidden">
        <CardImage item={item} sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" />
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

const WeatherAlertBar = async () => {
  const warnings = await listActiveWeatherWarnings(3);
  if (warnings.length === 0) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-1.5 text-xs font-medium text-amber-900 sm:px-6 lg:px-8">
        <span aria-hidden="true">⚠</span>
        <span className="shrink-0">氣象警報：</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {warnings.map((warning) => (
            <Link key={warning.id} href={`/news/${warning.id}`} className="whitespace-nowrap underline decoration-amber-300 underline-offset-2 hover:text-amber-950">
              {warning.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

// Taiwan EPA UV index categories (低量級/中量級/高量級/過量級/危險量級).
const uvCategory = (uv: number): { label: string; color: string } => {
  if (uv >= 11) return { label: "危險", color: "#9333ea" };
  if (uv >= 8) return { label: "過量", color: "#dc2626" };
  if (uv >= 6) return { label: "高量", color: "#ea580c" };
  if (uv >= 3) return { label: "中量", color: "#ca8a04" };
  return { label: "低量", color: "#16a34a" };
};

const UvIndexBar = async () => {
  const readings = await getLatestUvReadings(5);
  // Only surface it when there's something worth a glance — low UV days add
  // one more bar to scroll past for no reason, same threshold philosophy as
  // WeatherAlertBar only showing active warnings instead of every reading.
  const notable = readings.filter((r) => r.uv_index >= 6);
  if (notable.length === 0) return null;

  return (
    <div className="border-b border-sky-200 bg-sky-50">
      <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-1.5 text-xs font-medium text-sky-900 sm:px-6 lg:px-8">
        <span aria-hidden="true">☀️</span>
        <span className="shrink-0">紫外線：</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {notable.map((r) => {
            const { label, color } = uvCategory(r.uv_index);
            return (
              <span key={r.station_id} className="whitespace-nowrap">
                {r.county_name ?? ""}
                {r.station_name ?? r.station_id} UV {r.uv_index}
                <span style={{ color }} className="ml-1 font-semibold">
                  ({label})
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const StabloHeader = async () => (
  <header className="border-b border-neutral-200">
    <WeatherAlertBar />
    <UvIndexBar />
    <SiteNav />
  </header>
);

// Mirrors SiteNav's top-level groups (news source categories, 健康工具,
// 醫療院所) so the footer and navbar always list the same sections — a
// footer with a different/stale link set is a common WCAG 2.4.5 (multiple
// ways) and general-usability trap.
export const StabloFooter = () => {
  const calculatorTools = TOOL_CATALOG.filter((tool) => tool.group === "calculator");
  const facilityTools = TOOL_CATALOG.filter((tool) => tool.group === "facility");

  return (
    <footer className="mt-20 border-t border-neutral-200">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3 md:grid-cols-5">
          <FooterColumn label="總覽">
            <FooterLink href="/">首頁</FooterLink>
            <FooterLink href="/news">健康新聞</FooterLink>
          </FooterColumn>
          {SOURCE_CATEGORIES.map((category) => (
            <FooterColumn key={category.key} label={category.label}>
              {category.sources.map((source) => (
                <FooterLink key={source.sourceName} href={`/news?source=${encodeURIComponent(source.sourceName)}`}>
                  {source.label}
                </FooterLink>
              ))}
            </FooterColumn>
          ))}
          <FooterColumn label="健康工具">
            {calculatorTools.map((tool) => (
              <FooterLink key={tool.slug} href={`/tools/${tool.slug}`}>
                {tool.title}
              </FooterLink>
            ))}
          </FooterColumn>
          <FooterColumn label="醫療院所">
            {facilityTools.map((tool) => (
              <FooterLink key={tool.slug} href={`/tools/${tool.slug}`}>
                {tool.title}
              </FooterLink>
            ))}
          </FooterColumn>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-neutral-200 pt-6 text-sm text-neutral-500 md:flex-row md:items-center">
          <p>Copyright © {new Date().getFullYear()} j172tw Health. All rights reserved.</p>
          <a
            href="https://www.j172.tw"
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-none transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            j172.tw ↗
          </a>
        </div>
      </div>
    </footer>
  );
};

const FooterColumn = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">{label}</p>
    <ul className="mt-3 space-y-2">{children}</ul>
  </div>
);

const FooterLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <li>
    <Link href={href} className="rounded-none text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      {children}
    </Link>
  </li>
);

interface Pagination {
  currentPage: number;
  totalPages: number;
  sourceName?: string;
  keyword?: string;
  group?: string;
}

const pageHref = (page: number, sourceName?: string, keyword?: string, group?: string): string => {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (sourceName) params.set("source", sourceName);
  if (keyword) params.set("keyword", keyword);
  if (group && !sourceName) params.set("group", group);
  const query = params.toString();
  return query ? `/news?${query}` : "/news";
};

const Pagination = ({ currentPage, totalPages, sourceName, keyword, group }: Pagination) => {
  if (totalPages <= 1) return null;

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav className="mt-12 flex items-center justify-center gap-4 text-sm font-medium text-neutral-600" aria-label="分頁">
      {prevDisabled ? (
        <span className="cursor-not-allowed text-neutral-300">← 上一頁</span>
      ) : (
        <Link href={pageHref(currentPage - 1, sourceName, keyword, group)} className="transition-colors hover:text-neutral-900">
          ← 上一頁
        </Link>
      )}

      <span className="text-neutral-500">
        第 {currentPage} / {totalPages} 頁
      </span>

      {nextDisabled ? (
        <span className="cursor-not-allowed text-neutral-300">下一頁 →</span>
      ) : (
        <Link href={pageHref(currentPage + 1, sourceName, keyword, group)} className="transition-colors hover:text-neutral-900">
          下一頁 →
        </Link>
      )}
    </nav>
  );
};

/** Coarse group tabs for the archive view — lets readers browse "all official sources"
 * etc. as one merged feed instead of picking a single outlet from the nav dropdown. */
const GroupTabs = ({ activeGroupKey }: { activeGroupKey?: string }) => (
  <nav className="mb-8 flex flex-wrap gap-x-6 gap-y-2 border-b border-neutral-200 pb-3 text-sm font-medium" aria-label="來源分類">
    <Link
      href="/news"
      className={activeGroupKey ? "text-neutral-500 transition-colors hover:text-neutral-900" : "text-neutral-900"}
    >
      全部
    </Link>
    {SOURCE_CATEGORIES.map((category) => (
      <Link
        key={category.key}
        href={`/news?group=${category.key}`}
        className={
          activeGroupKey === category.key ? "text-neutral-900" : "text-neutral-500 transition-colors hover:text-neutral-900"
        }
      >
        {category.label}
      </Link>
    ))}
  </nav>
);

export default function StabloNewsLayout({
  items,
  variant,
  pagination,
  archiveTitle,
  archiveDescription,
  activeGroupKey,
}: {
  items: NewsListItem[];
  variant: Variant;
  pagination?: Pagination;
  archiveTitle?: string;
  archiveDescription?: string;
  activeGroupKey?: string;
}) {
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
                    <CardImage item={featured} sizes="(max-width: 1024px) 100vw, 66vw" />
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
                {side.map((item) => (
                  <PostCard key={item.id} item={item} titleClassName="text-[24px] leading-[1.2]" />
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
                {latest.map((item) => (
                  <PostCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <GroupTabs activeGroupKey={activeGroupKey} />

            <section className="mb-10">
              <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.025em] text-neutral-800">{archiveTitle ?? "News"}</h1>
              <p className="mt-2 text-[16px] leading-6 text-neutral-800">
                {archiveDescription ?? (archiveTitle ? `來自${archiveTitle}的新聞。` : "See all posts we have ever written.")}
              </p>
            </section>

            {items.length === 0 ? (
              <p className="py-16 text-center text-neutral-500">目前沒有符合的新聞。</p>
            ) : (
              <section className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <PostCard key={item.id} item={item} />
                ))}
              </section>
            )}

            {pagination ? (
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                sourceName={pagination.sourceName}
                keyword={pagination.keyword}
                group={pagination.group}
              />
            ) : null}
          </>
        )}
      </main>

      <StabloFooter />
    </div>
  );
}