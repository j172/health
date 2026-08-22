import { getTopViewedNews, type NewsListItem } from "@/lib/server/news/queries";
import { listActiveCwaAlerts } from "@/lib/server/cwa/queries";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { getTieredEarthquakes } from "@/lib/server/earthquakes/queries";
import SiteNav from "@/components/News/SiteNav";
import SiteFooter from "@/components/News/SiteFooter";
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
    sourceNames:
      cat.key === "gov"
        ? [...cat.sources.map((s) => s.sourceName), "cwa"]
        : cat.sources.map((s) => s.sourceName),
  }));

  // Fetch Weather Warnings, Earthquakes & Trending News for Sidebar Card Widgets
  const [cwaAlerts, earthquakes, topViewedNews] = await Promise.all([
    listActiveCwaAlerts(10),
    getTieredEarthquakes(168, 20),
    getTopViewedNews(10),
  ]);
  // Falls back to the recency list until real view data accumulates (e.g.
  // right after this feature ships) — otherwise the widget would render
  // empty for every article that hasn't been viewed yet.
  const trendingNews =
    topViewedNews.length > 0 ? topViewedNews : items.slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <StabloHeader />

      <main className="mx-auto max-w-7xl px-4 pt-8 pb-20 sm:px-6 lg:px-8">
        {variant === "home" && hero ? (
          <>
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
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {archiveDescription}
                </p>
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
                  cwaAlerts={cwaAlerts}
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
