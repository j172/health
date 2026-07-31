"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type AqiSite } from "@/app/api/aqi/route";

const DEFAULT_COUNTIES = ["臺北市", "新北市", "臺中市", "高雄市", "桃園市"];

export default function AqiSidebarWidget() {
  const [stations, setStations] = useState<AqiSite[]>([]);
  const [selectedCounty, setSelectedCounty] = useState("臺北市");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/aqi?county=${encodeURIComponent(selectedCounty)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.stations) {
          setStations(data.stations);
        }
      })
      .catch((err) => console.error("AQI Widget fetch error:", err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedCounty]);

  const primarySite = stations[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            即時空氣品質 (AQI)
          </h3>
        </div>
        <select
          value={selectedCounty}
          onChange={(e) => setSelectedCounty(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 outline-none"
        >
          {DEFAULT_COUNTIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="mt-4 flex h-24 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : primarySite ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {primarySite.county} · {primarySite.siteName}測站
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  {primarySite.aqiValue ?? "--"}
                </span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white shadow-xs"
                  style={{ backgroundColor: primarySite.aqiColor || "#10B981" }}
                >
                  {primarySite.aqiStatus || "良好"}
                </span>
              </div>
            </div>
            {primarySite.pm25 !== null && (
              <div className="text-right">
                <span className="block text-[10px] uppercase font-semibold text-slate-400">
                  PM2.5
                </span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {primarySite.pm25} μg/m³
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 text-center text-xs text-slate-400 py-3">暫無測站資料</div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Link
          href="/tools/aqi"
          className="flex items-center justify-between text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <span>查看全台 84 個測站 AQI 地圖</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
