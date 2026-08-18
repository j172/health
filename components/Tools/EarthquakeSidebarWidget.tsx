import Link from "next/link";
import { type SignificantEarthquake } from "@/lib/server/earthquakes/queries";

const toTaipeiShort = (value: Date | string | null): string => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Taipei",
    }).format(new Date(value));
  } catch {
    return "";
  }
};

function safeToFixed(val: unknown, digits = 1): string {
  const num = typeof val === "number" ? val : parseFloat(String(val ?? ""));
  return isNaN(num) ? "0.0" : num.toFixed(digits);
}

const parseMag = (val: unknown): number => {
  const num = typeof val === "number" ? val : parseFloat(String(val ?? ""));
  return isNaN(num) ? 0 : num;
};

const magnitudeColor = (magInput: unknown): string => {
  const mag = parseMag(magInput);
  if (mag >= 8.0) return "#7c3aed";
  if (mag >= 7.0) return "#dc2626";
  if (mag >= 6.0) return "#ea580c";
  return "#4f46e5";
};

// Display tier (see getTieredEarthquakes): CWA covers Taiwan M4.0+, USGS
// covers worldwide M6.0+ — primary_source tells us which rule qualified
// this row, which doubles as the right label for the source badge.
const sourceLabel = (primarySource: string | null): string => (primarySource === "cwa" ? "中央氣象署" : "USGS");

const MAX_ITEMS = 5;

export default function EarthquakeSidebarWidget({
  earthquakes = [],
}: {
  earthquakes?: SignificantEarthquake[];
}) {
  const items = earthquakes.slice(0, MAX_ITEMS);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-orange-500 animate-pulse" />
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            近期地震動態
          </h3>
        </div>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          全台+全球顯著
        </span>
      </div>

      <div className="mt-4">
        {items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((q) => {
              const color = magnitudeColor(q.magnitude);
              return (
                <li
                  key={q.id}
                  className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="text-sm font-extrabold" style={{ color }}>
                        M {safeToFixed(q.magnitude, 1)}
                      </span>
                      {q.tsunami_warning === 1 && <span title="海嘯警報">🌊</span>}
                    </span>
                    <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                      {q.place_zh ?? q.place ?? "未知地點"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                    <span className="rounded bg-slate-200/70 px-1.5 py-0.5 font-bold uppercase text-slate-500 dark:bg-slate-700/70 dark:text-slate-400">
                      {sourceLabel(q.primary_source)}
                    </span>
                    <span>{toTaipeiShort(q.event_time)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex items-baseline justify-between rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                近 7 天全台與全球地殼狀態
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  平穩
                </span>
                <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-xs">
                  無顯著地震
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Link
          href="/tools/earthquakes"
          className="flex items-center justify-between text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <span>查看全部地震動態</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
