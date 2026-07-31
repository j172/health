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

const WeatherAlertBar = async () => {
  const warnings = await listActiveWeatherWarnings(3);
  if (warnings.length === 0) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-300 sm:px-6 lg:px-8">
        <span aria-hidden="true">⚠️</span>
        <span className="shrink-0 font-bold">氣象警報：</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {warnings.map((w) => (
            <Link
              key={w.id}
              href={`/news/${w.id}`}
              className="whitespace-nowrap underline decoration-amber-300 underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
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
    <div className="border-b border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/40">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-1.5 text-xs font-medium text-orange-900 dark:text-orange-300 sm:px-6 lg:px-8">
        <span aria-hidden="true">🌐</span>
        <span className="shrink-0 font-bold">全球地震：</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {quakes.map((q) => {
            const magnitude = Number(q.magnitude);
            return q.url ? (
              <a key={q.id} href={q.url} target="_blank" rel="noreferrer noopener" className="hover:text-orange-950 dark:hover:text-orange-100">
                <span className="font-semibold text-orange-600 dark:text-orange-400">M{magnitude.toFixed(1)}</span> {q.place_zh ?? q.place}
              </a>
            ) : (
              <span key={q.id}>M{magnitude.toFixed(1)} {q.place_zh ?? q.place}</span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const StabloHeader = async () => (
  <header>
    <WeatherAlertBar />
    <NearbyWeatherBar />
    <SignificantEarthquakesBar />
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
  const hero = items[0];
  const secondary = items.slice(1, 3);
  const mainList = items.slice(3);

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
                <NewsSidebar recentNews={items.slice(0, 5)} activeGroupKey={activeGroupKey} />
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
                <NewsSidebar recentNews={items.slice(0, 5)} activeGroupKey={activeGroupKey} />
              </div>
            </div>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}