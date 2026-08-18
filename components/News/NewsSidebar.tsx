"use client";

import Link from "next/link";
import { type NewsListItem, type WeatherWarningItem } from "@/lib/server/news/queries";
import { type SignificantEarthquake } from "@/lib/server/earthquakes/queries";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import AqiSidebarWidget from "@/components/Tools/AqiSidebarWidget";
import UvSidebarWidget from "@/components/Tools/UvSidebarWidget";
import WeatherAlertSidebarWidget from "@/components/Tools/WeatherAlertSidebarWidget";
import EarthquakeSidebarWidget from "@/components/Tools/EarthquakeSidebarWidget";
import { useLanguage } from "@/app/context/LanguageContext";
import { toTaipei } from "@/lib/format/news";

export default function NewsSidebar({
  trendingNews = [],
  weatherWarnings = [],
  earthquakes = [],
  activeGroupKey,
}: {
  trendingNews?: NewsListItem[];
  weatherWarnings?: WeatherWarningItem[];
  earthquakes?: SignificantEarthquake[];
  activeGroupKey?: string;
}) {
  const { t, locale } = useLanguage();

  return (
    <aside className="space-y-6" aria-label="側邊資訊欄">
      {/* 1. Instant AQI Widget */}
      <AqiSidebarWidget />

      {/* 2. Weather Alert Card Widget */}
      <WeatherAlertSidebarWidget warnings={weatherWarnings} />

      {/* 2.5. Instant UV Index Widget */}
      <UvSidebarWidget />

      {/* 3. Earthquake Card Widget */}
      <EarthquakeSidebarWidget earthquakes={earthquakes} />

      {/* 4. Source Categories Cloud */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-3.5">
          {t("categories.sourcesHeading", "公衛與新聞來源")}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/news"
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              !activeGroupKey
                ? "bg-indigo-600 text-white dark:bg-indigo-500"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {t("categories.allNews", "全部新聞")}
          </Link>
          {SOURCE_CATEGORIES.map((cat) => (
            <Link
              key={cat.key}
              href={`/news?group=${cat.key}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                activeGroupKey === cat.key
                  ? "bg-indigo-600 text-white dark:bg-indigo-500"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {locale === "en" ? t(`categories.${cat.key}`, cat.label) : cat.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 5. Trending News List (by real view count — see getTopViewedNews) */}
      {trendingNews.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-4">
            {t("categories.trendingHeading", "🔥 熱門焦點新聞")}
          </h3>
          <div className="space-y-4">
            {trendingNews.slice(0, 10).map((item, idx) => (
              <article key={item.id} className="group flex gap-3 items-start">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="line-clamp-2 text-xs font-semibold text-slate-800 leading-snug group-hover:text-indigo-600 dark:text-slate-200 dark:group-hover:text-indigo-400 transition-colors">
                    <Link href={`/news/${item.id}`}>{item.title}</Link>
                  </h4>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {item.feed_name} · {toTaipei(item.published_at_utc, "short")}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
