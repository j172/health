import Link from "next/link";
import { getTopViewedNews, type NewsListItem } from "@/lib/server/news/queries";
import { listActiveCwaAlerts } from "@/lib/server/cwa/queries";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { getTieredEarthquakes } from "@/lib/server/earthquakes/queries";
import { getLatestBlogPosts } from "@/lib/server/blog/queries";
import SiteNav from "@/components/News/SiteNav";
import SiteFooter from "@/components/News/SiteFooter";
import CivicPartnersSection from "@/components/Common/CivicPartnersSection";
import NewsCard from "@/components/News/NewsCard";
import HeroPost from "@/components/News/HeroPost";
import NewsSidebar from "@/components/News/NewsSidebar";
import HomeCategoryNewsSection from "@/components/News/HomeCategoryNewsSection";
import GroupTabs from "@/components/News/GroupTabs";
import PaginationBar, {
  type Pagination,
} from "@/components/News/PaginationBar";

export { default as StabloFooter } from "@/components/News/SiteFooter";
export {
  NEWS_PAGE_SIZE_OPTIONS,
  DEFAULT_NEWS_PAGE_SIZE,
} from "@/components/News/PaginationBar";

type Variant = "home" | "archive";

export const StabloHeader = async () => (
  <header>
    <SiteNav />
  </header>
);

export default async function StabloNewsLayout({
  items,
  variant,
  pagination,
  archiveTitle,
  archiveDescription,
  activeGroupKey,
  blogItem,
  blogItems,
}: {
  items: NewsListItem[];
  variant: Variant;
  pagination?: Pagination;
  archiveTitle?: string;
  archiveDescription?: string;
  activeGroupKey?: string;
  blogItem?: NewsListItem | null;
  blogItems?: NewsListItem[];
}) {
  const hero = items[0];
  const secondary = items.slice(1, 3);
  const homeNewsPool = items.slice(3);
  const homeSourceCategories = SOURCE_CATEGORIES.map((cat) => ({
    key: cat.key,
    label: cat.label,
    sourceNames:
      cat.key === "gov"
        ? [...cat.sources.map((s) => s.sourceName), "cwa"]
        : cat.sources.map((s) => s.sourceName),
  }));

  // Fetch Weather Warnings, Earthquakes, Trending News & Latest Blog Posts
  const [cwaAlerts, earthquakes, topViewedNews, latestBlogPosts] = await Promise.all([
    listActiveCwaAlerts(10),
    getTieredEarthquakes(168, 20),
    getTopViewedNews(10),
    blogItems !== undefined
      ? Promise.resolve(blogItems)
      : blogItem !== undefined
        ? Promise.resolve(blogItem ? [blogItem] : [])
        : variant === "home"
          ? getLatestBlogPosts(6)
          : Promise.resolve([]),
  ]);
  // Falls back to the recency list until real view data accumulates (e.g.
  // right after this feature ships) — otherwise the widget would render
  // empty for every article that hasn't been viewed yet.
  // When falling back, exclude articles already prominently displayed in hero & secondary
  // so the sidebar doesn't display exact duplicates of the top section.
  const featuredIds = new Set(
    [hero?.id, ...secondary.map((s) => s.id)].filter((id): id is number => id !== undefined),
  );
  const trendingNews =
    topViewedNews.length > 0
      ? topViewedNews
      : items.filter((item) => !featuredIds.has(item.id)).slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <StabloHeader />

      <main className="mx-auto max-w-7xl px-4 pt-8 pb-20 sm:px-6 lg:px-8">
        {variant === "home" && hero ? (
          <>
            {/* Urgent Public Safety Hotline Quick Access */}
            <section
              className="mb-8 overflow-hidden rounded-2xl border border-rose-200/80 bg-linear-to-r from-rose-50/90 via-amber-50/70 to-orange-50/80 p-4 shadow-xs sm:p-5 dark:border-rose-900/60 dark:from-rose-950/40 dark:via-amber-950/30 dark:to-orange-950/30"
              aria-label="急用緊急求助電話快捷直撥"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-md shadow-rose-500/20">
                    <span className="text-xl">🚨</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                        </span>
                        重要民生急救資訊
                      </span>
                      <h2 className="text-base font-extrabold tracking-tight text-slate-900 sm:text-lg dark:text-slate-100">
                        全臺急用緊急專線速查與直撥目錄
                      </h2>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
                      彙整 110、119、112、113、118 及全台 22 縣市 1999 直撥代表號，提供即時撥號與離線應急查詢。
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href="tel:110"
                    className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700"
                  >
                    <span>🚔</span> 110 警政
                  </a>
                  <a
                    href="tel:119"
                    className="inline-flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-red-700"
                  >
                    <span>🚒</span> 119 救護
                  </a>
                  <a
                    href="tel:112"
                    className="inline-flex items-center gap-1 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-amber-700"
                  >
                    <span>📶</span> 112 求救
                  </a>
                  <Link
                    href="/tools/emergency-hotlines"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3.5 py-1.5 text-xs font-extrabold text-rose-700 shadow-xs transition-colors hover:bg-rose-50 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-slate-800"
                  >
                    <span>47組完整專線與 1999 直撥</span>
                    <span>➔</span>
                  </Link>
                </div>
              </div>
            </section>

            {/* NextBlog Hero Section */}
            <section className="mb-12" aria-label="焦點頭條新聞">
              <HeroPost hero={hero} secondary={secondary} />
            </section>

            {/* Main Content Grid + NextBlog Sidebar */}
            <div className="grid gap-10 lg:grid-cols-3">
              {/* Left News Grid (2 columns on lg) */}
              <div className="space-y-8 lg:col-span-2">
                <HomeCategoryNewsSection
                  items={homeNewsPool}
                  categories={homeSourceCategories}
                  blogItems={latestBlogPosts}
                />
              </div>

              {/* Right Sidebar (1 column on lg) */}
              <div className="lg:col-span-1">
                <NewsSidebar
                  trendingNews={trendingNews}
                  cwaAlerts={cwaAlerts}
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
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
                {archiveTitle ?? "最新新聞列表"}
              </h1>
              {archiveDescription && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {archiveDescription}
                </p>
              )}
            </div>

            <div className="grid gap-10 lg:grid-cols-3">
              <div className="lg:col-span-2">
                {items.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-600 dark:border-slate-800 dark:bg-slate-900">
                    {/* An <h2> here (not just plain text) keeps the page's
                        heading levels sequential down to the sidebar's <h3>
                        widgets even on this empty-results path — see issue
                        #262, Lighthouse "heading-order". */}
                    <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300">
                      目前沒有符合的新聞報導
                    </h2>
                    <p className="mt-1 text-sm">請稍後再試，或切換其他分類瀏覽。</p>
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
                  cwaAlerts={cwaAlerts}
                  earthquakes={earthquakes}
                  activeGroupKey={activeGroupKey}
                />
              </div>
            </div>

            {variant === "home" && <CivicPartnersSection />}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
