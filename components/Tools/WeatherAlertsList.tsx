"use client";

import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";
import type { CwaAlertItem } from "@/lib/server/cwa/queries";

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

/**
 * Renders + paginates the "生效中氣象特報" list (issue #157). Split out of the
 * server-rendered page.tsx so the page/pageSize state (URL-backed, via usePagination)
 * can live in a client component — the alerts themselves are still fetched server-side
 * and just passed down as a prop, no extra round trip.
 *
 * Paging is client-side over whatever the page fetched (see WEATHER_ALERTS_FETCH_LIMIT
 * in page.tsx). Order is untouched — still "most severe first, most recent within a
 * severity" exactly as listActiveCwaAlerts() returns it.
 */
export default function WeatherAlertsList({ alerts }: { alerts: CwaAlertItem[] }) {
  const { page, pageSize, setPage, setPageSize } = usePagination();

  // Clamp defensively — a page number that was valid before still needs to render
  // something sane if it's somehow past the end (e.g. after a page-size change).
  const totalPages = Math.max(1, Math.ceil(alerts.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const pagedAlerts = alerts.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {pagedAlerts.map((alert) => {
          const isTsunami = alert.dataset_id === "E-A0014-001";
          const isTyphoon = alert.dataset_id === "W-C0034-001" || alert.dataset_id === "W-C0034-005";
          const isTownship = alert.dataset_id === "W-C0033-001";
          const badge = SEVERITY_BADGES[alert.severity || ""] || SEVERITY_BADGES.Moderate;

          const effectiveStr = formatTaipeiTime(alert.effective);
          const expiresStr = formatTaipeiTime(alert.expires);

          return (
            <article
              key={`${alert.dataset_id}-${alert.id}-${alert.event}`}
              className={`flex flex-col justify-between rounded-2xl border p-5 shadow-xs transition-all ${
                isTsunami ? "border-red-400 bg-red-50/90 dark:border-red-700 dark:bg-red-950/40" : badge.card
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
                    <h4 className={`text-sm font-extrabold tracking-tight ${isTsunami ? "text-red-900 dark:text-red-100" : badge.text}`}>
                      {alert.event || alert.headline || "氣象警報"}
                    </h4>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      isTsunami ? "bg-red-600 text-white animate-pulse" : badge.chip
                    }`}
                  >
                    {isTsunami ? "海嘯警報" : badge.label}
                  </span>
                </div>

                {alert.headline && alert.headline !== alert.event && (
                  <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">{alert.headline}</p>
                )}

                {alert.description && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-line">{alert.description}</p>
                )}

                {alert.instruction && (
                  <div className="mt-3 rounded-xl border border-slate-200/80 bg-white/80 p-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">🛡️ 防災指引：</span>
                    {alert.instruction}
                  </div>
                )}

                {alert.area_desc && (
                  <div className="mt-3">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      📍 影響範圍 {alert.area_count ? `(共 ${alert.area_count} 地區)` : ""}：
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-200">{alert.area_desc}</p>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between border-t border-slate-200/60 pt-3 text-[11px] text-slate-400 dark:border-slate-800">
                <div>
                  {effectiveStr && <span>發布：{effectiveStr}</span>}
                  {expiresStr && <span className="ml-2">預計至：{expiresStr}</span>}
                </div>
                <span className="font-mono text-[10px] text-slate-400">{alert.dataset_id}</span>
              </div>
            </article>
          );
        })}
      </div>

      <Pagination page={page} pageSize={pageSize} totalItems={alerts.length} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="則特報" />
    </>
  );
}
