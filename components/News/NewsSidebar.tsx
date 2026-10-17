"use client";

import Link from "next/link";
import { type NewsListItem } from "@/lib/server/news/queries";
import { type SignificantEarthquake } from "@/lib/server/earthquakes/queries";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import FactCheckNotice from "@/components/News/FactCheckNotice";
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
import AntiFraudSidebarWidget from "@/components/Tools/AntiFraudSidebarWidget";
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
  hideStatusBarDuplicateWidgets = false,
}: {
  trendingNews?: NewsListItem[];
  cwaAlerts?: CwaAlertItem[];
  earthquakes?: SignificantEarthquake[];
  activeGroupKey?: string;
  /**
   * Hides only the 5 widgets below that duplicate the homepage's new top
   * status bar — items 1 `LocalWeatherSvgWidget`, 2
   * `WeatherAlertSidebarWidget`, 4 `EarthquakeSidebarWidget`, 5
   * `AqiSidebarWidget`, 6 `UvSidebarWidget` (issue #472, parent #438 §G).
   * The homepage now covers that same weather/AQI/UV/earthquake/alerts
   * ground via its own top status bar fed by a single `/api/home-status`
   * aggregation call, so rendering these 5 again here would duplicate that
   * and bring back their independent per-widget client fetches.
   *
   * Items 3 `ErStatusSidebarWidget`, 7 `CpcPriceSidebarWidget`, 8
   * `WaterOutageSidebarWidget`, 9 `CdcAlertSidebarWidget`, 10
   * `PestAlertSidebarWidget` are NOT covered by the new status bar and
   * always render regardless of this flag — product decision (2026-10-13
   * review of issue #472): keep all 10 original widgets' *content*
   * reachable from the homepage, only consolidating the 5 that are now
   * genuinely redundant.
   *
   * Item 11 `AntiFraudSidebarWidget` (added by issue #575) is new, not one
   * of the original 10 — same reasoning as items 3/7/8/9/10 applies to it
   * too: "本月新增涉詐網域數" isn't one of the home status bar's 5 scoped
   * sections (weather/AQI/UV/earthquake/alerts), so it always renders
   * regardless of this flag.
   *
   * Defaults to `false` so `/news` archive pages are completely unaffected.
   */
  hideStatusBarDuplicateWidgets?: boolean;
}) {
  const { t, locale, tDynamic } = useLanguage();

  return (
    <aside className="space-y-6" aria-label="側邊資訊欄">
      {!hideStatusBarDuplicateWidgets && (
        <>
          {/* 1. 所在位置即時天氣 (CWA O-A0001-001) — covered by the home
              status bar on home, so hidden there. */}
          <LocalWeatherSvgWidget />

          {/* 2. 氣象災害特警報 — covered by the home status bar on home. */}
          <WeatherAlertSidebarWidget alerts={cwaAlerts} />
        </>
      )}

      {/* 3. 全台急診即時看板 — not covered by the home status bar, always renders. */}
      <ErStatusSidebarWidget />

      {!hideStatusBarDuplicateWidgets && (
        <>
          {/* 4. 有感地震即時速報 — covered by the home status bar on home. */}
          <EarthquakeSidebarWidget earthquakes={earthquakes} />

          {/* 5. 空氣品質 AQI — covered by the home status bar on home. */}
          <AqiSidebarWidget />

          {/* 6. 即時紫外線指數 — covered by the home status bar on home. */}
          <UvSidebarWidget />
        </>
      )}

      {/* 7. 中油油價預測 — not covered by the home status bar, always renders. */}
      <CpcPriceSidebarWidget />

      {/* 8. 自來水即時停水通知 — not covered by the home status bar, always renders. */}
      <WaterOutageSidebarWidget />

      {/* 9. 疾管署國際旅遊疫情 — not covered by the home status bar, always renders. */}
      <CdcAlertSidebarWidget />

      {/* 10. 農業動植物疫情警報 — not covered by the home status bar, always renders. */}
      <PestAlertSidebarWidget />

      {/* 11. 本月新增涉詐網域數 (issue #575) — not covered by the home status
          bar, always renders. Links through to /tools/anti-fraud. */}
      <AntiFraudSidebarWidget />

      {/* 12. 熱門焦點新聞 (依瀏覽量排序) */}
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
                    <FactCheckNotice
                      sourceName={item.source_name}
                      sourceLabel={resolveAuthorLabel(item)}
                      className="mt-1"
                    />
                    <p className="mt-1 text-[11px] text-slate-600" suppressHydrationWarning>
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

      {/* 13. 資訊免疫力與認知防衛專欄 */}
      <ContextualPartnerCard
        partnerId="anti-cw"
        compact={true}
        contextTitle="數位免疫力：反認知作戰"
        contextDescription="閱讀公衛與即時新聞之餘，可前往反認知作戰教育網學習闢謠與假訊息辨識技巧。"
      />

      {/* 14. 公衛與新聞來源標籤雲 */}
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
