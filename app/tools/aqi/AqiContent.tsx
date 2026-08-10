"use client";

import { useEffect, useState } from "react";
import type { AqiSite } from "@/lib/server/aqi/types";
import LoadingOrb from "@/components/ui/LoadingOrb";

const COUNTIES = [
  "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市",
  "基隆市", "新竹市", "新竹縣", "苗栗縣", "彰化縣", "南投縣",
  "雲林縣", "嘉義市", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣",
  "臺東縣", "澎湖縣", "金門縣", "連江縣",
];

function AqiPollutant({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2 text-center dark:bg-slate-800/60">
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
      <p className="mt-0.5 text-xs font-bold text-slate-800 dark:text-slate-200">{value !== null ? value : "—"}</p>
      <p className="text-[10px] text-slate-400">{unit}</p>
    </div>
  );
}

export default function AqiContent() {
  const [county, setCounty] = useState("");
  const [stations, setStations] = useState<AqiSite[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams();
    if (county) params.set("county", county);

    fetch(`/api/aqi?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setStations(data.stations);
        setUpdatedAt(data.updatedAt);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [county]);

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-xl dark:bg-indigo-950">
            🌬️
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 sm:text-2xl">
              全台 AQI 空氣品質即時監測 Dashboard
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              環境部開放資料 · 每 30 分鐘自動同步更新
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <select
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 outline-none"
            >
              <option value="">全台 22 縣市測站</option>
              {COUNTIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {stations && (
              <span className="text-xs font-semibold text-slate-400">
                顯示 {stations.length} 個監測站
              </span>
            )}
          </div>

          {updatedAt && (
            <span className="text-xs text-slate-400">
              更新時間：{new Date(updatedAt).toLocaleString("zh-TW")}
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <LoadingOrb size={32} />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          無法取得 AQI 資料，請稍後再試。
        </div>
      )}

      {!loading && !error && stations && stations.length === 0 && (
        <div className="py-12 text-center text-sm text-slate-400">目前無符合條件的 AQI 測站資料。</div>
      )}

      {!loading && stations && stations.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((site) => (
            <div
              key={site.siteId}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              style={{ borderLeftWidth: 4, borderLeftColor: site.aqiColor }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                    {site.siteName}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">{site.county}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black" style={{ color: site.aqiColor }}>
                    {site.aqiValue ?? "—"}
                  </div>
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white"
                    style={{ backgroundColor: site.aqiColor }}
                  >
                    {site.aqiStatus}
                  </span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <AqiPollutant label="PM2.5" value={site.pm25} unit="μg/m³" />
                <AqiPollutant label="PM10" value={site.pm10} unit="μg/m³" />
                <AqiPollutant label="O₃" value={site.o3} unit="ppb" />
                <AqiPollutant label="NO₂" value={site.no2} unit="ppb" />
                <AqiPollutant label="SO₂" value={site.so2} unit="ppb" />
                <AqiPollutant label="CO" value={site.co} unit="ppm" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
