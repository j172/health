"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useGeolocation } from "@/components/Facilities/useGeolocation";
import MapLocationBanner from "@/components/Common/MapLocationBanner";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import type {
  InundationSensorItem,
  RiverWaterLevelAlert,
  InundationShelterPoint,
  InundationMapOverview,
} from "@/lib/server/inundation/types";

const InundationMapLeaflet = dynamic(() => import("@/components/Tools/InundationMapLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] sm:h-[480px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">
      載入互動式地圖中…
    </div>
  ),
});

const FALLBACK_INUNDATION_DATA: InundationMapOverview = {
  counties: [
    "臺北市", "新北市", "桃園市", "臺中市", "彰化縣", "雲林縣",
    "嘉義縣", "臺南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣",
  ],
  summary: {
    totalSensors: 12,
    normalCount: 12,
    warningCount: 0,
    criticalCount: 0,
    riverAlertCount: 0,
  },
  sensors: [
    {
      sensorId: "FB_TPE_01",
      sensorName: "基隆路地下道車行引道感測站",
      county: "臺北市",
      township: "信義區",
      address: "基隆路地下道南側引道",
      lat: 25.0345,
      lng: 121.5623,
      waterDepthCm: 0,
      warningDepthCm: 10,
      alertLevel: "normal",
      recordedAt: new Date().toISOString(),
      source: "水利署 IoT 即時水深感測網",
    },
    {
      sensorId: "FB_KHH_01",
      sensorName: "民族路地下道低窪警示測點",
      county: "高雄市",
      township: "三民區",
      address: "民族路九如路交叉引道",
      lat: 22.6398,
      lng: 120.3125,
      waterDepthCm: 0,
      warningDepthCm: 10,
      alertLevel: "normal",
      recordedAt: new Date().toISOString(),
      source: "水利署 IoT 即時水深感測網",
    },
  ],
  riverAlerts: [],
  shelters: [
    {
      id: "FB_SH_01",
      name: "信義區公所地下避難與應變中心",
      county: "臺北市",
      township: "信義區",
      address: "臺北市信義區信義路五段150號",
      capacity: 500,
      contactPhone: "02-27239777",
      lat: 25.0322,
      lng: 121.5694,
    },
  ],
};

export default function InundationMapContent() {
  const location = useGeolocation();
  const [data, setData] = useState<InundationMapOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCounty, setSelectedCounty] = useState<string>("all");
  const [onlyAlert, setOnlyAlert] = useState<boolean>(false);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedCounty !== "all") params.set("county", selectedCounty);
        if (onlyAlert) params.set("onlyAlert", "true");

        const res = await fetchWithTimeout(`/api/inundation-map?${params.toString()}`, { timeoutMs: 5000 });
        if (res.ok) {
          const json = await res.json();
          if (!ignore) setData(json);
        } else if (!ignore) {
          setData(FALLBACK_INUNDATION_DATA);
        }
      } catch (err) {
        console.warn("Using inundation fallback:", err);
        if (!ignore) setData(FALLBACK_INUNDATION_DATA);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadData();
    return () => {
      ignore = true;
    };
  }, [selectedCounty, onlyAlert]);

  const counties = data?.counties || [
    "臺北市", "新北市", "桃園市", "臺中市", "彰化縣", "雲林縣",
    "嘉義縣", "臺南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣"
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* 頂部標題與跨頁導流 Banner */}
      <div className="bg-gradient-to-r from-sky-800 via-cyan-800 to-blue-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-md mb-4">
            <span>🌊 經濟部水利署 IoT 路面感測 ＋ NCDR 災防聯防</span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse"></span>
            <span>公分級即時水深</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            全台積淹水即時感測地圖
          </h1>
          <p className="text-cyan-100 text-base sm:text-lg leading-relaxed mb-6">
            結合經濟部水利署各河川分署 IoT 路面公分級水深感測器、河川水位站一至三級防汛溢堤警戒，以及周邊緊急避難收容處所。遇颱風豪雨，提供用路人低窪涵洞避災與疏散指引。
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/tools/water-conditions"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>💧</span>
              <span>全台水情：河川水位與水庫營運查詢</span>
            </Link>
            <Link
              href="/tools/disaster-map"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>⚠️</span>
              <span>天然災害示警與避難地圖</span>
            </Link>
            <Link
              href="/tools/weather-alerts"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>🌧️</span>
              <span>中央氣象署特報</span>
            </Link>
          </div>
        </div>
      </div>

      <MapLocationBanner location={location} facilityTypeName="低窪積淹水測站與避難所" />

      {/* 摘要概況卡片 */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              監測低窪感測點
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {data.summary.totalSensors} <span className="text-sm font-normal text-slate-500">處</span>
            </div>
            <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              正常無積水 {data.summary.normalCount} 處
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              路面積水警戒 (&gt;10cm)
            </div>
            <div className="text-2xl font-bold text-amber-500">
              {data.summary.warningCount} <span className="text-sm font-normal text-slate-500">處</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">地下道或引道警戒</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              嚴重淹水警報 (&gt;30cm)
            </div>
            <div className="text-2xl font-bold text-rose-600">
              {data.summary.criticalCount} <span className="text-sm font-normal text-slate-500">處</span>
            </div>
            <div className="mt-1 text-xs text-rose-500">車輛嚴禁駛入</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              河川高水位站
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {data.summary.riverAlertCount} <span className="text-sm font-normal text-slate-500">站警戒</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">水利署防汛即時監控</div>
          </div>
        </div>
      )}

      {/* 篩選工具列 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
        {/* 縣市快速切換 */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-thin">
          <span className="text-xs font-bold text-slate-400 whitespace-nowrap">縣市：</span>
          <button
            onClick={() => setSelectedCounty("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              selectedCounty === "all"
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            全部縣市
          </button>
          {counties.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedCounty(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedCounty === c
                  ? "bg-sky-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* 僅看警戒點開關 */}
        <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
          <input
            type="checkbox"
            checked={onlyAlert}
            onChange={(e) => setOnlyAlert(e.target.checked)}
            className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
          />
          <span>只顯示警戒／淹水測站</span>
        </label>
      </div>

      {/* 內容區塊 */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-3 text-sm text-slate-500">正在同步水利署 IoT 與河川水位數據...</p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* 0. 互動式地圖總覽 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>🗺️</span>
                <span>感測站與避難所地圖總覽</span>
              </h2>
              <span className="text-xs text-slate-500">
                點擊圖示查看詳細資訊
              </span>
            </div>
            <div className="h-[380px] sm:h-[480px] w-full overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <InundationMapLeaflet
                sensors={data?.sensors || []}
                shelters={data?.shelters || []}
                userLocation={location}
              />
            </div>
          </div>

          {/* 1. 路面淹水感測器列表 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>🛣️</span>
                <span>全台重要地下道、涵洞與低窪路面感測站</span>
              </h2>
              <span className="text-xs text-slate-500">
                共 {data?.sensors.length || 0} 個感測站點
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.sensors.map((s) => {
                const isCritical = s.alertLevel === "critical";
                const isWarning = s.alertLevel === "warning";
                return (
                  <div
                    key={s.sensorId}
                    className={`bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border transition flex flex-col justify-between ${
                      isCritical
                        ? "border-rose-300 dark:border-rose-800 ring-2 ring-rose-500/20"
                        : isWarning
                        ? "border-amber-300 dark:border-amber-800"
                        : "border-slate-100 dark:border-slate-700 hover:shadow-md"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
                            {s.county} · {s.township}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${
                            isCritical
                              ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 animate-pulse"
                              : isWarning
                              ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                              : "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {isCritical ? "嚴重積水" : isWarning ? "水位警戒" : "通行正常"}
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">
                        {s.sensorName}
                      </h3>
                      <p className="text-xs text-slate-500 mb-3">{s.address || "防汛道路旁"}</p>

                      {/* 水深測量值 */}
                      <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg mb-3">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs text-slate-500">即時路面水深</span>
                          <span
                            className={`text-xl font-black ${
                              isCritical
                                ? "text-rose-600"
                                : isWarning
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {s.waterDepthCm.toFixed(1)}{" "}
                            <span className="text-xs font-medium text-slate-400">cm</span>
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isCritical
                                ? "bg-rose-500"
                                : isWarning
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                            }`}
                            style={{
                              width: `${Math.min(100, Math.max(5, (s.waterDepthCm / 30) * 100))}%`,
                            }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                          <span>安全 (&lt;10cm)</span>
                          <span>警戒線 {s.warningDepthCm}cm</span>
                          <span>危險 (&gt;30cm)</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                      <span>來源：{s.source}</span>
                      <span>{new Date(s.recordedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })} 更新</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. 河川水位警戒站 */}
          {data?.riverAlerts && data.riverAlerts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>🌊</span>
                  <span>水利署河川流域防汛水位站警戒</span>
                </h2>
                <span className="text-xs text-slate-500">
                  共 {data.riverAlerts.length} 個水文監測站
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.riverAlerts.map((r, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                        {r.county} · {r.riverName}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                          r.alertLevel === "critical"
                            ? "bg-rose-100 text-rose-700"
                            : r.alertLevel === "warning"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {r.statusText}
                      </span>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm mb-1">
                      {r.stationName}
                    </div>
                    <div className="text-xs text-slate-500 mb-2">
                      即時水位：
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {r.currentWaterLevel.toFixed(2)} 公尺
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      觀測時間：{new Date(r.recordedAt).toLocaleString("zh-TW", { hour12: false })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. 周邊避難收容處所 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>🏫</span>
                <span>低窪淹水高風險區緊急避難收容處所</span>
              </h2>
              <span className="text-xs text-slate-500">
                可容納避難民眾之活動中心與校園體育館
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.shelters.map((sh) => (
                <div
                  key={sh.id}
                  className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                      {sh.county} · {sh.township}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      容量 {sh.capacity} 人
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1">
                    {sh.name}
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">{sh.address}</p>
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <span className="text-xs text-slate-400">災防專線：</span>
                    <a
                      href={`tel:${sh.contactPhone.replace(/[^0-9]/g, "")}`}
                      className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      📞 {sh.contactPhone}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. 防汛與涉水安全宣導 */}
          <div className="bg-sky-50 dark:bg-sky-950/40 rounded-xl p-6 border border-sky-100 dark:border-sky-900/50">
            <h3 className="text-base font-bold text-sky-900 dark:text-sky-200 mb-3 flex items-center gap-2">
              <span>💡</span>
              <span>豪雨防汛與行車涉水黃金自救守則</span>
            </h3>
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
              <li className="bg-white/60 dark:bg-slate-900/40 p-3 rounded-lg">
                <strong className="block text-sky-950 dark:text-sky-100 mb-1 font-bold">
                  1. 水深過半輪切勿涉水
                </strong>
                當道路積水達輪胎半徑（約 15~20cm）時，極易湧入排氣管或進氣口造成車輛熄火；積水達 30cm 時小型車易被水流浮起失控。
              </li>
              <li className="bg-white/60 dark:bg-slate-900/40 p-3 rounded-lg">
                <strong className="block text-sky-950 dark:text-sky-100 mb-1 font-bold">
                  2. 泡水車輛「千萬切勿發動」
                </strong>
                若車輛不幸泡水熄火，發動引擎會將積水吸入汽缸導致引擎爆震損毀。請立即解開安全帶、移往高處，並撥打道路救援。
              </li>
              <li className="bg-white/60 dark:bg-slate-900/40 p-3 rounded-lg">
                <strong className="block text-sky-950 dark:text-sky-100 mb-1 font-bold">
                  3. 徒步涉水請著雨鞋持杖
                </strong>
                淹水路面孔蓋常因水壓被頂起沖失，涉水時應手持長傘或手杖試探前方深度，並避開變壓箱與斷落電線以防感電。
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
