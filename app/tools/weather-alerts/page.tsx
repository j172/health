import type { Metadata } from "next";
import {
  listActiveCwaAlerts,
  listTopRainfallStations,
  type CwaAlertItem,
} from "@/lib/server/cwa/queries";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import WeatherRainfallLocator from "@/components/Tools/WeatherRainfallLocator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

const SEVERITY_BADGES: Record<
  string,
  { label: string; chip: string; card: string; text: string }
> = {
  Extreme: {
    label: "極端危險",
    chip: "bg-red-600 text-white",
    card: "border-red-300 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/30",
    text: "text-red-950 dark:text-red-100",
  },
  Severe: {
    label: "嚴重警戒",
    chip: "bg-orange-500 text-white",
    card: "border-orange-300 bg-orange-50/70 dark:border-orange-900/60 dark:bg-orange-950/30",
    text: "text-orange-950 dark:text-orange-100",
  },
  Moderate: {
    label: "中度注意",
    chip: "bg-amber-500 text-white",
    card: "border-amber-300 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30",
    text: "text-amber-950 dark:text-amber-100",
  },
  Minor: {
    label: "輕微提示",
    chip: "bg-yellow-500 text-white",
    card: "border-yellow-300 bg-yellow-50/70 dark:border-yellow-900/60 dark:bg-yellow-950/30",
    text: "text-yellow-950 dark:text-yellow-100",
  },
};

const formatTaipeiTime = (val: Date | string | null | undefined): string | null => {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
};

export default async function WeatherAlertsPage() {
  const [alerts, topStations] = await Promise.all([
    listActiveCwaAlerts(30),
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
            <div className="grid gap-4 sm:grid-cols-2">
              {alerts.map((alert: CwaAlertItem) => {
                const isTsunami = alert.dataset_id === "E-A0014-001";
                const isTyphoon =
                  alert.dataset_id === "W-C0034-001" ||
                  alert.dataset_id === "W-C0034-005";
                const isTownship = alert.dataset_id === "W-C0033-001";
                const badge =
                  SEVERITY_BADGES[alert.severity || ""] || SEVERITY_BADGES.Moderate;

                const effectiveStr = formatTaipeiTime(alert.effective);
                const expiresStr = formatTaipeiTime(alert.expires);

                return (
                  <article
                    key={`${alert.dataset_id}-${alert.id}-${alert.event}`}
                    className={`flex flex-col justify-between rounded-2xl border p-5 shadow-xs transition-all ${
                      isTsunami
                        ? "border-red-400 bg-red-50/90 dark:border-red-700 dark:bg-red-950/40"
                        : badge.card
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">
                            {isTsunami && "🌊"}
                            {isTyphoon && "🌀"}
                            {isTownship && "⚡"}
                            {!isTsunami && !isTyphoon && !isTownship && "📢"}
                          </span>
                          <h4
                            className={`text-sm font-extrabold tracking-tight ${
                              isTsunami
                                ? "text-red-900 dark:text-red-100"
                                : badge.text
                            }`}
                          >
                            {alert.event || alert.headline || "氣象警報"}
                          </h4>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            isTsunami
                              ? "bg-red-600 text-white animate-pulse"
                              : badge.chip
                          }`}
                        >
                          {isTsunami ? "海嘯警報" : badge.label}
                        </span>
                      </div>

                      {alert.headline && alert.headline !== alert.event && (
                        <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {alert.headline}
                        </p>
                      )}

                      {alert.description && (
                        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-line">
                          {alert.description}
                        </p>
                      )}

                      {alert.instruction && (
                        <div className="mt-3 rounded-xl border border-slate-200/80 bg-white/80 p-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">
                            🛡️ 防災指引：
                          </span>
                          {alert.instruction}
                        </div>
                      )}

                      {alert.area_desc && (
                        <div className="mt-3">
                          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            📍 影響範圍 {alert.area_count ? `(共 ${alert.area_count} 地區)` : ""}：
                          </p>
                          <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-200">
                            {alert.area_desc}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between border-t border-slate-200/60 pt-3 text-[11px] text-slate-400 dark:border-slate-800">
                      <div>
                        {effectiveStr && <span>發布：{effectiveStr}</span>}
                        {expiresStr && <span className="ml-2">預計至：{expiresStr}</span>}
                      </div>
                      <span className="font-mono text-[10px] text-slate-400">
                        {alert.dataset_id}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
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
