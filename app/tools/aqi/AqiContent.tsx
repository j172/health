"use client";

import { useEffect, useState } from "react";
import type { AqiSite } from "@/app/api/aqi/route";

const COUNTIES = [
  "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市",
  "基隆市", "新竹市", "新竹縣", "苗栗縣", "彰化縣", "南投縣",
  "雲林縣", "嘉義市", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣",
  "臺東縣", "澎湖縣", "金門縣", "連江縣",
];

function AqiPollutant({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="rounded-none bg-neutral-50 p-1.5 text-center">
      <p className="text-neutral-500">{label}</p>
      <p className="font-semibold text-neutral-800">{value !== null ? value : "—"}</p>
      <p className="text-neutral-400">{unit}</p>
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
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">🌬️ AQI 空氣品質即時查詢</h1>
        <p className="text-neutral-600">即時顯示全台環境部監測站 AQI 空氣品質指標，包含 PM2.5、PM10 等污染物濃度。</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={county}
          onChange={(e) => setCounty(e.target.value)}
          className="rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-primary focus:outline-none"
        >
          <option value="">全部縣市</option>
          {COUNTIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {stations && <span className="text-sm text-neutral-500">共 {stations.length} 個測站</span>}
      </div>

      {updatedAt && <p className="text-xs text-neutral-500">資料更新時間：{new Date(updatedAt).toLocaleString("zh-TW")}</p>}
      <p className="text-sm text-neutral-500">資料來源：環境部環境資料開放平台，每小時更新一次。</p>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && <div className="rounded-none bg-red-50 p-4 text-sm text-red-700">查詢 AQI 資料失敗，請稍後再試。</div>}

      {!loading && !error && stations && stations.length === 0 && <div className="py-8 text-center text-neutral-500">目前無 AQI 資料。</div>}

      {!loading && stations && stations.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((site) => (
            <div key={site.siteId} className="rounded-none border border-neutral-200 p-4" style={{ borderLeftWidth: 4, borderLeftColor: site.aqiColor }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-neutral-800">{site.siteName}</p>
                  <p className="text-xs text-neutral-500">{site.county}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold" style={{ color: site.aqiColor }}>
                    {site.aqiValue ?? "—"}
                  </p>
                  <p className="text-xs font-medium" style={{ color: site.aqiColor }}>
                    {site.aqiStatus}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-xs">
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
