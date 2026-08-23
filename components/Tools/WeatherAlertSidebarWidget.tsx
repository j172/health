import Link from "next/link";
import { type CwaAlertItem } from "@/lib/server/cwa/queries";

/**
 * CAP severity, ordered. Colour carries the same ranking as the sort in
 * listActiveCwaAlerts, so scanning the list top-down matches the colour ramp.
 */
const SEVERITY_STYLES: Record<
  string,
  { label: string; chip: string; card: string; text: string }
> = {
  Extreme: {
    label: "極端",
    chip: "bg-red-600 text-white",
    card: "bg-red-50/80 border-red-200/60 dark:bg-red-950/40 dark:border-red-900/40",
    text: "text-red-950 dark:text-red-200",
  },
  Severe: {
    label: "嚴重",
    chip: "bg-orange-500 text-white",
    card: "bg-orange-50/80 border-orange-200/60 dark:bg-orange-950/40 dark:border-orange-900/40",
    text: "text-orange-950 dark:text-orange-200",
  },
  Moderate: {
    label: "中等",
    chip: "bg-amber-500 text-white",
    card: "bg-amber-50/80 border-amber-200/50 dark:bg-amber-950/40 dark:border-amber-900/30",
    text: "text-amber-950 dark:text-amber-200",
  },
  Minor: {
    label: "輕微",
    chip: "bg-yellow-500 text-white",
    card: "bg-yellow-50/80 border-yellow-200/50 dark:bg-yellow-950/40 dark:border-yellow-900/30",
    text: "text-yellow-950 dark:text-yellow-200",
  },
};

const FALLBACK_STYLE = {
  label: "警報",
  chip: "bg-slate-500 text-white",
  card: "bg-slate-50 border-slate-200/60 dark:bg-slate-800/60 dark:border-slate-700/60",
  text: "text-slate-900 dark:text-slate-200",
};

const styleFor = (severity: string | null) =>
  (severity && SEVERITY_STYLES[severity]) || FALLBACK_STYLE;

/** Taipei time, to the minute — these are all short-lived. */
const formatUntil = (value: Date | string | null): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

/**
 * Reads cwa_alerts directly rather than the CWA RSS items in news_items.
 *
 * The table had been written on every sync and read by nothing, so severity,
 * urgency and the affected areas — the parts a reader actually needs — never
 * reached the page. The RSS feed the old version used carries none of them.
 */
export default function WeatherAlertSidebarWidget({
  alerts = [],
}: {
  alerts?: CwaAlertItem[];
}) {
  const hasAlerts = alerts.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-2.5 w-2.5 rounded-full ${
              hasAlerts ? "animate-pulse bg-amber-500" : "bg-emerald-500"
            }`}
          />
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            即時氣象警報
          </h3>
        </div>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          中央氣象署
        </span>
      </div>

      <div className="mt-4">
        {hasAlerts ? (
          <ul className="space-y-2">
            {alerts.map((alert) => {
              const style = styleFor(alert.severity);
              const until = formatUntil(alert.expires);
              const isTsunami = alert.dataset_id === "E-A0014-001";
              const isTownshipHazard = alert.dataset_id === "W-C0033-001";
              const isTyphoon =
                alert.dataset_id === "W-C0034-001" ||
                alert.dataset_id === "W-C0034-005";

              return (
                <li
                  key={`${alert.dataset_id}-${alert.id}-${alert.event}`}
                  className={`rounded-xl border p-3 ${
                    isTsunami
                      ? "border-red-500/80 bg-red-100/90 dark:border-red-700 dark:bg-red-950/70"
                      : style.card
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-xs leading-snug font-bold ${
                        isTsunami
                          ? "text-red-900 dark:text-red-100"
                          : style.text
                      }`}
                    >
                      {isTsunami && "🌊 "}
                      {isTyphoon && "🌀 "}
                      {isTownshipHazard && "⚡ "}
                      {alert.event || alert.headline || "氣象警報"}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isTsunami ? "bg-red-600 text-white animate-pulse" : style.chip
                      }`}
                    >
                      {isTsunami ? "海嘯警報" : style.label}
                    </span>
                  </div>

                  {alert.area_desc ? (
                    <p className="mt-1.5 line-clamp-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      📍 {alert.area_desc}
                      {alert.area_count && alert.area_count > 1 ? (
                        <span className="ml-1 font-semibold text-slate-500 dark:text-slate-500">
                          （共 {alert.area_count} 個地區）
                        </span>
                      ) : null}
                    </p>
                  ) : null}

                  {until ? (
                    <p className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-500">
                      有效至 {until}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex items-baseline justify-between rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                全台天氣概況
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  正常
                </span>
                <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-xs">
                  無特報
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Link
          href="/tools/weather-alerts"
          className="flex items-center justify-between text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <span>查看即時氣象警報與雨量站</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
