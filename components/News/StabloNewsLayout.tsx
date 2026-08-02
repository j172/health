import Link from "next/link";
import { getTopViewedNews, listActiveWeatherWarnings, type NewsListItem } from "@/lib/server/news/queries";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { getRecentSignificantEarthquakes } from "@/lib/server/earthquakes/queries";
import SiteNav from "@/components/News/SiteNav";
import SiteFooter from "@/components/News/SiteFooter";
import NewsCard from "@/components/News/NewsCard";
import HeroPost from "@/components/News/HeroPost";
import NewsSidebar from "@/components/News/NewsSidebar";
import HomeCategoryNewsSection from "@/components/News/HomeCategoryNewsSection";

export { default as StabloFooter } from "@/components/News/SiteFooter";

export const NEWS_PAGE_SIZE_OPTIONS = [30, 50, 100] as const;
export const DEFAULT_NEWS_PAGE_SIZE = 30;

type Variant = "home" | "archive";

interface Pagination {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  sourceName?: string;
  keyword?: string;
  group?: string;
}

export const StabloHeader = async () => (
  <header>
    <SiteNav />
  </header>
);

const GroupTabs = ({ activeGroupKey }: { activeGroupKey?: string }) => (
  <nav className="mb-8 flex flex-wrap items-center gap-2" aria-label="來源分類">
    <Link
      href="/news"
      className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
        !activeGroupKey
          ? "bg-indigo-600 text-white dark:bg-indigo-500 shadow-sm"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      }`}
    >
      全部新聞
    </Link>
    {SOURCE_CATEGORIES.map((cat) => (
      <Link
        key={cat.key}
        href={`/news?group=${cat.key}`}
        className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
          activeGroupKey === cat.key
            ? "bg-indigo-600 text-white dark:bg-indigo-500 shadow-sm"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        }`}
      >
        {cat.label}
      </Link>
    ))}
  </nav>
);

const PaginationBar = ({ pagination }: { pagination: Pagination }) => {
  const { currentPage, totalPages, pageSize, sourceName, keyword, group } = pagination;

  const buildUrl = (page: number, size: number) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (size !== DEFAULT_NEWS_PAGE_SIZE) params.set("size", String(size));
    if (group) params.set("group", group);
    if (sourceName) params.set("source", sourceName);
    if (keyword) params.set("keyword", keyword);
    const str = params.toString();
    return `/news${str ? `?${str}` : ""}`;
  };

  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      {/* Page Size Selector */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <span>每頁顯示：</span>
        <div className="flex items-center gap-1.5">
          {NEWS_PAGE_SIZE_OPTIONS.map((size) => (
            <Link
              key={size}
              href={buildUrl(1, size)}
              className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                pageSize === size
                  ? "bg-indigo-600 font-bold text-white dark:bg-indigo-500 shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {size} 筆
            </Link>
          ))}
        </div>
      </div>

      {/* Page Navigation Buttons */}
      <nav aria-label="新聞分頁" className="flex items-center gap-1.5 self-center sm:self-auto">
        {currentPage > 1 && (
          <Link
            href={buildUrl(currentPage - 1, pageSize)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750"
          >
            ‹ 上一頁
          </Link>
        )}

        {pages[0] > 1 && (
          <>
            <Link
              href={buildUrl(1, pageSize)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              1
            </Link>
            {pages[0] > 2 && <span className="px-0.5 text-xs text-slate-400">...</span>}
          </>
        )}

        {pages.map((p) => (
          <Link
            key={p}
            href={buildUrl(p, pageSize)}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
              currentPage === p
                ? "bg-indigo-600 text-white dark:bg-indigo-500 shadow-xs"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {p}
          </Link>
        ))}

        {pages[pages.length - 1] < totalPages && (
          <>
            {pages[pages.length - 1] < totalPages - 1 && <span className="px-0.5 text-xs text-slate-400">...</span>}
            <Link
              href={buildUrl(totalPages, pageSize)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {totalPages}
            </Link>
          </>
        )}

        {currentPage < totalPages && (
          <Link
            href={buildUrl(currentPage + 1, pageSize)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750"
          >
            下一頁 ›
          </Link>
        )}
      </nav>
    </div>
  );
};

export default async function StabloNewsLayout({
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
  const hero = items[0];
  const secondary = items.slice(1, 3);
  const homeNewsPool = items.slice(3);
  const homeSourceCategories = SOURCE_CATEGORIES.map((cat) => ({
    key: cat.key,
    label: cat.label,
    sourceNames: cat.key === "gov" ? [...cat.sources.map((s) => s.sourceName), "cwa"] : cat.sources.map((s) => s.sourceName),
  }));

  // Fetch Weather Warnings, Earthquakes & Trending News for Sidebar Card Widgets
  const [weatherWarnings, earthquakes, topViewedNews] = await Promise.all([
    listActiveWeatherWarnings(3),
    getRecentSignificantEarthquakes(6.0, 72, 5),
    getTopViewedNews(5),
  ]);
  // Falls back to the recency list until real view data accumulates (e.g.
  // right after this feature ships) — otherwise the widget would render
  // empty for every article that hasn't been viewed yet.
  const trendingNews = topViewedNews.length > 0 ? topViewedNews : items.slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <StabloHeader />

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        {variant === "home" && hero ? (
          <>
            {/* NextBlog Hero Section */}
            <section className="mb-12" aria-label="焦點頭條新聞">
              <HeroPost hero={hero} secondary={secondary} />
            </section>

            {/* Main Content Grid + NextBlog Sidebar */}
            <div className="grid gap-10 lg:grid-cols-3">
              {/* Left News Grid (2 columns on lg) */}
              <div className="lg:col-span-2 space-y-8">
                <HomeCategoryNewsSection items={homeNewsPool} categories={homeSourceCategories} />
              </div>

              {/* Right Sidebar (1 column on lg) */}
              <div className="lg:col-span-1">
                <NewsSidebar
                  trendingNews={trendingNews}
                  weatherWarnings={weatherWarnings}
                  earthquakes={earthquakes}
                  activeGroupKey={activeGroupKey}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Archive Layout */}
            <GroupTabs activeGroupKey={activeGroupKey} />

            <div className="mb-8">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                {archiveTitle ?? "最新新聞列表"}
              </h1>
              {archiveDescription && (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{archiveDescription}</p>
              )}
            </div>

            <div className="grid gap-10 lg:grid-cols-3">
              <div className="lg:col-span-2">
                {items.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                    目前沒有符合的新聞報導。
                  </div>
                ) : (
                  <>
                    <div className="grid gap-6 sm:grid-cols-2">
                      {items.map((item) => (
                        <NewsCard key={item.id} item={item} />
                      ))}
                    </div>
                    {pagination && <PaginationBar pagination={pagination} />}
                  </>
                )}
              </div>
              <div className="lg:col-span-1">
                <NewsSidebar
                  trendingNews={trendingNews}
                  weatherWarnings={weatherWarnings}
                  earthquakes={earthquakes}
                  activeGroupKey={activeGroupKey}
                />
              </div>
            </div>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}