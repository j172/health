import type { Metadata } from "next";
import {
  listActiveCwaAlerts,
  listTopRainfallStations,
} from "@/lib/server/cwa/queries";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import WeatherRainfallLocator from "@/components/Tools/WeatherRainfallLocator";
import WeatherAlertsList from "@/components/Tools/WeatherAlertsList";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Issue #157: the alerts list now paginates client-side (30/50/100 per page) over
// whatever this fetches, so the old hardcoded 30-row cap needs enough headroom to
// actually page through. Active alerts are naturally a small set (tens, not
// hundreds), so 100 comfortably covers it without an unbounded query.
const WEATHER_ALERTS_FETCH_LIMIT = 100;

const canonical = `${getBaseUrl()}/tools/weather-alerts`;
const catalogEntry = getToolCatalogEntry("weather-alerts");

export const metadata: Metadata = {
  title: "全台即時氣象警報與降雨資訊 | 豪大雨・強風・颱風・海嘯特報",
  description:
    "即時查詢中央氣象署 (CWA) 豪大雨特報、陸上強風、濃霧、颱風警報及海嘯資訊，並依 GPS 定位查詢最近雨量測站即時與月累積降雨量。",
  keywords: [
    "氣象警報",
    "豪雨特報",
    "大雨特報",
    "強風特報",
    "颱風警報",
    "海嘯警報",
    "雨量站查詢",
    "累積雨量",
    "中央氣象署",
  ],
  alternates: { canonical },
  openGraph: {
    title: "全台即時氣象警報與降雨資訊 | 豪大雨・強風・颱風・海嘯特報",
    description:
      "即時連線中央氣象署 5 大警報與全台 1,300+ 座雨量站，提供即時特報預警與 GPS 最近雨量站資訊。",
    url: canonical,
  },
};

export default async function WeatherAlertsPage() {
  const [alerts, topStations] = await Promise.all([
    listActiveCwaAlerts(WEATHER_ALERTS_FETCH_LIMIT),
    listTopRainfallStations(5),
  ]);

  return (
    <ToolPageShell
      slug="weather-alerts"
      title={catalogEntry.title}
      maxWidthClassName="max-w-5xl"
    >
      <div className="space-y-10">
        {/* Header summary */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-3 w-3 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
              全台即時氣象警報與降雨監測
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              中央氣象署 CWA 即時連線
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 sm:text-sm dark:text-slate-400">
            整合陸上強風特報 (W-C0033-003)、濃霧特報 (W-C0033-004)、豪大雨特報 (W-C0033-005)、颱風警報與路徑 (W-C0034-001/005)、海嘯資訊及全台各鄉鎮劇烈天氣特報。
          </p>
        </div>

        {/* 1. Rainfall Locator Module */}
        <section
          aria-labelledby="rainfall-locator-heading"
          className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-950/40"
        >
          <WeatherRainfallLocator initialTopStations={topStations} />
        </section>

        {/* 2. Active Weather Alerts Section */}
        <section aria-labelledby="alerts-list-heading" className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h3
                id="alerts-list-heading"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                ⚠️ 生效中氣象特報與災害預警
              </h3>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                共 {alerts.length} 則特報
              </span>
            </div>
            <span className="text-xs text-slate-400">
              更新頻率：每 5-10 分鐘
            </span>
          </div>

          {alerts.length > 0 ? (
            <WeatherAlertsList alerts={alerts} />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50/60 p-8 text-center dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <span className="text-4xl">🟢</span>
              <h4 className="mt-2 text-base font-bold text-emerald-900 dark:text-emerald-200">
                全台天氣概況良好
              </h4>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                中央氣象署目前未發布任何豪大雨、強風、濃霧或颱風警報。
              </p>
            </div>
          )}
        </section>
      </div>
    </ToolPageShell>
  );
}
