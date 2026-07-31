import Link from "next/link";
import { type WeatherWarningItem } from "@/lib/server/news/queries";

export default function WeatherAlertSidebarWidget({
  warnings = [],
}: {
  warnings?: WeatherWarningItem[];
}) {
  const hasWarnings = warnings.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-2.5 w-2.5 rounded-full ${
              hasWarnings ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
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
        {hasWarnings ? (
          <div className="rounded-xl bg-amber-50/80 p-3.5 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-900/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                目前發布 {warnings.length} 則警特報
              </span>
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                生效中
              </span>
            </div>
            <ul className="mt-2.5 space-y-2">
              {warnings.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/news/${w.id}`}
                    className="line-clamp-2 text-xs font-semibold text-amber-950 hover:underline dark:text-amber-200"
                  >
                    ⚠️ {w.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
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
          href="/news?source=cwa"
          className="flex items-center justify-between text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <span>查看所有氣象警報報導</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
