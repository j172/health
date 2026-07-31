import Link from "next/link";
import { listActiveWeatherWarnings, type NewsListItem } from "@/lib/server/news/queries";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { getRecentSignificantEarthquakes } from "@/lib/server/earthquakes/queries";
import SiteNav from "@/components/News/SiteNav";
import SiteFooter from "@/components/News/SiteFooter";
import NearbyWeatherBar from "@/components/News/NearbyWeatherBar";
import NewsCard from "@/components/News/NewsCard";
import HeroPost from "@/components/News/HeroPost";
import NewsSidebar from "@/components/News/NewsSidebar";

export { default as StabloFooter } from "@/components/News/SiteFooter";

export const NEWS_PAGE_SIZE_OPTIONS = [30, 50, 100, 150] as const;
export const DEFAULT_NEWS_PAGE_SIZE = 50;

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
    <NearbyWeatherBar />
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
  const mainList = items.slice(3);

  // Fetch Weather Warnings & Earthquakes for Sidebar Card Widgets
  const [weatherWarnings, earthquakes] = await Promise.all([
    listActiveWeatherWarnings(3),
    getRecentSignificantEarthquakes(6.0, 72, 5),
  ]);

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
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                    最新健康動態與即時新聞
                  </h2>
                  <Link
                    href="/news"
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    查看全部新聞 →
                  </Link>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  {mainList.map((item) => (
                    <NewsCard key={item.id} item={item} />
                  ))}
                </div>
              </div>

              {/* Right Sidebar (1 column on lg) */}
              <div className="lg:col-span-1">
                <NewsSidebar
                  recentNews={items.slice(0, 5)}
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
                  <div className="grid gap-6 sm:grid-cols-2">
                    {items.map((item) => (
                      <NewsCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </div>
              <div className="lg:col-span-1">
                <NewsSidebar
                  recentNews={items.slice(0, 5)}
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