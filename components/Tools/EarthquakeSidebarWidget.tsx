import { type SignificantEarthquake } from "@/lib/server/earthquakes/queries";

const toTaipeiShort = (value: Date): string =>
  new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));

const magnitudeColor = (mag: number): string => {
  if (mag >= 8.0) return "#7c3aed";
  if (mag >= 7.0) return "#dc2626";
  return "#ea580c";
};

export default function EarthquakeSidebarWidget({
  earthquakes = [],
}: {
  earthquakes?: SignificantEarthquake[];
}) {
  const primaryQuake = earthquakes[0];
  const secondaryQuakes = earthquakes.slice(1, 4);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-orange-500 animate-pulse" />
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            即時全球地震 (M6.0+)
          </h3>
        </div>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          全球觀測網
        </span>
      </div>

      <div className="mt-4">
        {primaryQuake ? (
          <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                {primaryQuake.place_zh ?? primaryQuake.place ?? "未知地點"} · {toTaipeiShort(primaryQuake.event_time)}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="text-2xl font-extrabold"
                    style={{ color: magnitudeColor(Number(primaryQuake.magnitude)) }}
                  >
                    M {Number(primaryQuake.magnitude).toFixed(1)}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white shadow-xs"
                    style={{ backgroundColor: magnitudeColor(Number(primaryQuake.magnitude)) }}
                  >
                    顯著地震
                  </span>
                </div>
                {primaryQuake.url && (
                  <a
                    href={primaryQuake.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    詳細 ↗
                  </a>
                )}
              </div>
            </div>

            {secondaryQuakes.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5 text-xs">
                {secondaryQuakes.map((q) => (
                  <div key={q.id} className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="truncate max-w-[160px]">
                      {q.place_zh ?? q.place ?? "地區"}
                    </span>
                    <span className="font-bold shrink-0" style={{ color: magnitudeColor(Number(q.magnitude)) }}>
                      M{Number(q.magnitude).toFixed(1)} · {toTaipeiShort(q.event_time)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-baseline justify-between rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                近 72 小時全球地殼狀態
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  平穩
                </span>
                <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-xs">
                  無顯著強震
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        <a
          href="https://earthquake.usgs.gov"
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center justify-between text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <span>查看 USGS 全球地震即時數據</span>
          <span>↗</span>
        </a>
      </div>
    </div>
  );
}
