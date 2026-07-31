import Link from "next/link";
import { listActiveWeatherWarnings, type NewsListItem } from "@/lib/server/news/queries";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { getRecentSignificantEarthquakes } from "@/lib/server/earthquakes/queries";
import SiteNav from "@/components/News/SiteNav";
import SiteFooter from "@/components/News/SiteFooter";
import NearbyWeatherBar from "@/components/News/NearbyWeatherBar";
import NewsCard from "@/components/News/NewsCard";
import HeroPost from "@/components/News/HeroPost";

// ─── Re-exports for backward compat (used in /news/[id]/page.tsx) ─────────────

export { default as StabloFooter } from "@/components/News/SiteFooter";

// ─── Constants ────────────────────────────────────────────────────────────────

export const NEWS_PAGE_SIZE_OPTIONS = [30, 50, 100, 150] as const;
export const DEFAULT_NEWS_PAGE_SIZE = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

type Variant = "home" | "archive";

interface Pagination {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  sourceName?: string;
  keyword?: string;
  group?: string;
}

// ─── Alert bars (server components) ──────────────────────────────────────────

const toTaipeiShort = (value: Date): string =>
  new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));

const magnitudeColor = (mag: number): string => {
  if (mag >= 8) return "#7c3aed";
  if (mag >= 7) return "#dc2626";
  return "#ea580c";
};

const WeatherAlertBar = async () => {
  const warnings = await listActiveWeatherWarnings(3);
  if (warnings.length === 0) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-1.5 text-xs font-medium text-amber-900 sm:px-6 lg:px-8">
        <span aria-hidden="true">⚠</span>
        <span className="shrink-0">氣象警報：</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {warnings.map((w) => (
            <Link
              key={w.id}
              href={`/news/${w.id}`}
              className="whitespace-nowrap underline decoration-amber-300 underline-offset-2 hover:text-amber-950"
            >
              {w.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

const SignificantEarthquakesBar = async () => {
  const quakes = await getRecentSignificantEarthquakes(6.0, 72, 5);
  if (quakes.length === 0) return null;
  return (
    <div className="border-b border-orange-200 bg-orange-50">
      <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-1.5 text-xs font-medium text-orange-900 sm:px-6 lg:px-8">
        <span aria-hidden="true">🌐</span>
        <span className="shrink-0">全球地震：</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {quakes.map((q) => {
            const magnitude = Number(q.magnitude);
            const content = (
              <span className="whitespace-nowrap">
                <span style={{ color: magnitudeColor(magnitude) }} className="font-semibold">
                  M{magnitude.toFixed(1)}
                </span>{" "}
                {q.place_zh ?? q.place ?? "未知地點"} · {toTaipeiShort(q.event_time)}
              </span>
            );
            return q.url ? (
              <a key={q.id} href={q.url} target="_blank" rel="noreferrer noopener" className="hover:text-orange-950">
                {content}
              </a>
            ) : (
              <span key={q.id}>{content}</span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Header (server component) ────────────────────────────────────────────────

export const StabloHeader = async () => (
  <header>
    <WeatherAlertBar />
    <NearbyWeatherBar />
    <SignificantEarthquakesBar />
    <SiteNav />
  </header>
);

// ─── Section: group tabs ──────────────────────────────────────────────────────

const GroupTabs = ({ activeGroupKey }: { activeGroupKey?: string }) => (
  <nav
    className="mb-8 flex flex-wrap items-center gap-2"
    aria-label="來源分類"
  >
    <Link
      href="/news"
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        !activeGroupKey
          ? "bg-primary text-white shadow-sm"
          : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      }`}
    >
      全部
    </Link>
    {SOURCE_CATEGORIES.map((cat) => (
      <Link
        key={cat.key}
        href={`/news?group=${cat.key}`}
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          activeGroupKey === cat.key
            ? "bg-primary text-white shadow-sm"
            : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
        }`}
      >
        {cat.label}
      </Link>
    ))}
  </nav>
);

// ─── Section: pagination ──────────────────────────────────────────────────────

const pageHref = (
  page: number,
  pageSize: number,
  sourceName?: string,
  keyword?: string,
  group?: string,
): string => {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (pageSize !== DEFAULT_NEWS_PAGE_SIZE) params.set("size", String(pageSize));
  if (sourceName) params.set("source", sourceName);
  if (keyword) params.set("keyword", keyword);
  if (group && !sourceName) params.set("group", group);
  const query = params.toString();
  return query ? `/news?${query}` : "/news";
};

const PaginationBar = ({
  currentPage,
  totalPages,
  pageSize,
  sourceName,
  keyword,
  group,
}: Pagination) => (
  <nav
    className="mt-14 flex flex-col items-center justify-center gap-5"
    aria-label="分頁"
  >
    {/* Page-size selector */}
    <div className="flex items-center gap-2 text-sm text-neutral-500">
      <span>每頁顯示：</span>
      {NEWS_PAGE_SIZE_OPTIONS.map((size) => (
        <Link
          key={size}
          href={pageHref(1, size, sourceName, keyword, group)}
          aria-current={size === pageSize ? "true" : undefined}
          className={
            size === pageSize
              ? "font-semibold text-neutral-900 underline underline-offset-4"
              : "transition-colors hover:text-neutral-900"
          }
        >
          {size}
        </Link>
      ))}
    </div>

    {/* Prev / page info / next */}
    {totalPages > 1 && (
      <div className="flex items-center gap-2">
        {currentPage <= 1 ? (
          <span className="inline-flex h-9 items-center rounded-full px-4 text-sm text-neutral-300">
            ← 上一頁
          </span>
        ) : (
          <Link
            href={pageHref(currentPage - 1, pageSize, sourceName, keyword, group)}
            className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            ← 上一頁
          </Link>
        )}

        <span className="min-w-[5rem] text-center text-sm text-neutral-400">
          第 {currentPage} / {totalPages} 頁
        </span>

        {currentPage >= totalPages ? (
          <span className="inline-flex h-9 items-center rounded-full px-4 text-sm text-neutral-300">
            下一頁 →
          </span>
        ) : (
          <Link
            href={pageHref(currentPage + 1, pageSize, sourceName, keyword, group)}
            className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            下一頁 →
          </Link>
        )}
      </div>
    )}
  </nav>
);

// ─── Default export ───────────────────────────────────────────────────────────

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
  // Home layout slices
  const hero = items[0];
  const featured = items.slice(1, 4);
  const latest = items.slice(4);

  return (
    <div className="min-h-screen bg-white text-neutral-800">
      <StabloHeader />

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        {variant === "home" && hero ? (
          <>
            {/* ── Hero ────────────────────────────────────────── */}
            <section aria-label="精選文章">
              <HeroPost item={hero} />
            </section>

            {/* ── Featured row (items 1-3) ─────────────────────── */}
            {featured.length > 0 && (
              <section className="mt-12" aria-label="近期報導">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <h2 className="text-[22px] font-bold tracking-[-0.025em] text-neutral-900">
                    近期報導
                  </h2>
                </div>
                <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                  {featured.map((item) => (
                    <NewsCard key={item.id} item={item} featured />
                  ))}
                </div>
              </section>
            )}

            {/* ── Latest grid (items 4+) ────────────────────────── */}
            {latest.length > 0 && (
              <section className="mt-14" aria-label="最新文章">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <h2 className="text-[22px] font-bold tracking-[-0.025em] text-neutral-900">
                    最新文章
                  </h2>
                  <Link
                    href="/news"
                    className="text-sm font-medium text-neutral-500 transition-colors hover:text-primary"
                  >
                    查看全部 →
                  </Link>
                </div>
                <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                  {latest.map((item) => (
                    <NewsCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            {/* ── Archive: tabs ─────────────────────────────────── */}
            <GroupTabs activeGroupKey={activeGroupKey} />

            {/* ── Archive: heading ──────────────────────────────── */}
            <section className="mb-10">
              <h1 className="text-[28px] font-bold tracking-[-0.025em] text-neutral-900">
                {archiveTitle ?? "最新新聞"}
              </h1>
              {archiveDescription && (
                <p className="mt-2 text-[15px] leading-6 text-neutral-500">{archiveDescription}</p>
              )}
              {!archiveDescription && !archiveTitle && (
                <p className="mt-2 text-[15px] leading-6 text-neutral-500">
                  彙整政府機關與健康媒體的最新公告與報導。
                </p>
              )}
            </section>

            {/* ── Archive: grid ────────────────────────────────── */}
            {items.length === 0 ? (
              <p className="py-20 text-center text-neutral-400">目前沒有符合的新聞。</p>
            ) : (
              <section className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3" aria-label="新聞列表">
                {items.map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </section>
            )}

            {/* ── Archive: pagination ───────────────────────────── */}
            {pagination && (
              <PaginationBar
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                pageSize={pagination.pageSize}
                sourceName={pagination.sourceName}
                keyword={pagination.keyword}
                group={pagination.group}
              />
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}