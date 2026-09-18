"use client";

import Link from "next/link";
import { type NewsListItem } from "@/lib/server/news/queries";
import { type SignificantEarthquake } from "@/lib/server/earthquakes/queries";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import AqiSidebarWidget from "@/components/Tools/AqiSidebarWidget";
import UvSidebarWidget from "@/components/Tools/UvSidebarWidget";
import WeatherAlertSidebarWidget from "@/components/Tools/WeatherAlertSidebarWidget";
import EarthquakeSidebarWidget from "@/components/Tools/EarthquakeSidebarWidget";
import LocalWeatherSvgWidget from "@/components/Tools/LocalWeatherSvgWidget";
import WaterOutageSidebarWidget from "@/components/Tools/WaterOutageSidebarWidget";
import CdcAlertSidebarWidget from "@/components/Tools/CdcAlertSidebarWidget";
import ErStatusSidebarWidget from "@/components/Tools/ErStatusSidebarWidget";
import PestAlertSidebarWidget from "@/components/Tools/PestAlertSidebarWidget";
import CpcPriceSidebarWidget from "@/components/Tools/CpcPriceSidebarWidget";
import { useLanguage } from "@/app/context/LanguageContext";
import { toTaipei, displayDate } from "@/lib/format/news";
import { getArticleDestination } from "@/lib/format/outboundLink";
import { type CwaAlertItem } from "@/lib/server/cwa/queries";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";

export default function NewsSidebar({
  trendingNews = [],
  cwaAlerts = [],
  earthquakes = [],
  activeGroupKey,
}: {
  trendingNews?: NewsListItem[];
  cwaAlerts?: CwaAlertItem[];
  earthquakes?: SignificantEarthquake[];
  activeGroupKey?: string;
}) {
  const { t, locale, tDynamic } = useLanguage();

  return (
    <aside className="space-y-6" aria-label="側邊資訊欄">
      {/* 1. 所在位置即時天氣 (CWA O-A0001-001) */}
      <LocalWeatherSvgWidget />

      {/* 2. 氣象災害特警報 */}
      <WeatherAlertSidebarWidget alerts={cwaAlerts} />

      {/* 3. 全台急診即時看板 */}
      <ErStatusSidebarWidget />

      {/* 4. 有感地震即時速報 */}
      <EarthquakeSidebarWidget earthquakes={earthquakes} />

      {/* 5. 空氣品質 AQI */}
      <AqiSidebarWidget />

      {/* 6. 即時紫外線指數 */}
      <UvSidebarWidget />

      {/* 7. 中油油價預測 */}
      <CpcPriceSidebarWidget />

      {/* 8. 自來水即時停水通知 */}
      <WaterOutageSidebarWidget />

      {/* 9. 疾管署國際旅遊疫情 */}
      <CdcAlertSidebarWidget />

      {/* 10. 農業動植物疫情警報 */}
      <PestAlertSidebarWidget />

      {/* 11. 熱門焦點新聞 (依瀏覽量排序) */}
      {trendingNews.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {t("categories.trendingHeading", "🔥 熱門焦點新聞")}
          </h3>
          <div className="space-y-4">
            {trendingNews.slice(0, 10).map((item, idx) => {
              const dest = getArticleDestination(item, "news_sidebar_trending");
              const externalProps = dest.isExternal ? { target: dest.target, rel: dest.rel } : {};
              return (
                <article key={item.id} className="group flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="line-clamp-2 text-xs leading-snug font-semibold text-slate-800 transition-colors group-hover:text-indigo-600 dark:text-slate-200 dark:group-hover:text-indigo-400">
                      <Link href={dest.href} {...externalProps}>
                        {tDynamic(item.title)}
                      </Link>
                    </h4>
                    <p className="mt-1 text-[11px] text-slate-600">
                      {item.feed_name} ·{" "}
                      {toTaipei(displayDate(item), "short")}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* 12. 資訊免疫力與認知防衛專欄 */}
      <ContextualPartnerCard
        partnerId="anti-cw"
        compact={true}
        contextTitle="數位免疫力：反認知作戰"
        contextDescription="閱讀公衛與即時新聞之餘，可前往反認知作戰教育網學習闢謠與假訊息辨識技巧。"
      />

      {/* 13. 公衛與新聞來源標籤雲 */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-3.5 text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
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
              {locale === "en"
                ? t(`categories.${cat.key}`, cat.label)
                : cat.label}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
