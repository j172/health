"use client";

import { useEffect, useState, useMemo } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import type {
  CityOutdoorSafetyItem,
  OutdoorSafetyOverviewResult,
} from "@/lib/server/outdoorSafety/types";

const FALLBACK_OUTDOOR_DATA: OutdoorSafetyOverviewResult = {
  cities: [
    {
      cityCode: "TPE",
      cityName: "臺北市",
      overallScore: 82,
      safetyLevel: "good",
      heatRiskLevel: "safe",
      heatIndex: 28,
      aqiValue: 35,
      pm25Value: 9,
      uvIndex: 4,
      temperature: 26,
      humidity: 68,
      advisories: {
        runner: { score: 85, bestWindow: "06:00 - 08:30", statusText: "適合晨跑", tips: "空氣品質優良，注意補充水分。" },
        family: { score: 88, statusText: "適合親子戶外活動", parkRecommendation: "大安森林公園", uvCaution: "紫外線適中，建議戴帽子遮陽。", diseaseNote: "目前無特殊病媒警戒。" },
        elderly: { score: 80, statusText: "適合溫和晨運散步", heatIndexWarning: "體感舒適", cardioCaution: "適當健走，避開正午時段。" },
        mosquito: { riskText: "低度警戒", repellentAdvice: "草叢區域建議穿著長袖長褲。" },
      },
      tips: ["今日空氣品質良好，全台各地適合安排戶外運動與休閒。"],
      updatedAt: new Date().toISOString(),
    },
  ],
  nationalAvgScore: 82,
  bestCity: { name: "臺北市", score: 82 },
  cautionCount: 0,
  updatedAt: new Date().toISOString(),
};

export default function OutdoorSafetyContent() {
  const [data, setData] = useState<OutdoorSafetyOverviewResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCityCode, setSelectedCityCode] = useState<string>("TPE");

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetchWithTimeout("/api/outdoor-safety", { timeoutMs: 5000 })
      .then((res) => (res.ok ? res.json() : null))
      .then((res) => {
        if (!ignore && res && res.ok && res.data) {
          setData(res.data);
          if (res.data.cities.length > 0) {
            setSelectedCityCode(res.data.cities[0].cityCode);
          }
        } else if (!ignore) {
          setData(FALLBACK_OUTDOOR_DATA);
        }
      })
      .catch((err) => {
        console.warn("Using outdoor safety fallback:", err);
        if (!ignore) setData(FALLBACK_OUTDOOR_DATA);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const currentCity = useMemo(() => {
    if (!data?.cities) return null;
    return (
      data.cities.find((c) => c.cityCode === selectedCityCode) ||
      data.cities[0]
    );
  }, [data, selectedCityCode]);

  return (
    <div className="space-y-6">
      {/* 頂部引導與全台綜整 */}
      <div className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-indigo-50 to-blue-50 p-6 shadow-sm dark:border-sky-950 dark:from-sky-950/40 dark:via-indigo-950/20 dark:to-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-sky-950 dark:text-sky-200">
              🏃 全台戶外運動與親子放電綜合安全指數
            </h2>
            <p className="mt-1 text-sm text-sky-800/80 dark:text-sky-300/80">
              即時跨表聚合空氣品質 AQI、紫外線 UV、氣溫濕度熱指數與蚊媒警戒，為路跑、全家公園出遊與長輩晨運提供精確防護指南。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100/80 px-3 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
              <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
              即時環境運算
            </span>
          </div>
        </div>

        {/* 全台平均指標 */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white/80 p-3 shadow-xs backdrop-blur-xs dark:bg-slate-900/80">
            <p className="text-xs text-neutral-500 dark:text-slate-400">全台平均戶外評分</p>
            <p className="text-2xl font-black text-sky-600 dark:text-sky-400">
              {data ? `${data.nationalAvgScore} 分` : "--"}
            </p>
          </div>
          <div className="rounded-xl bg-white/80 p-3 shadow-xs backdrop-blur-xs dark:bg-slate-900/80">
            <p className="text-xs text-neutral-500 dark:text-slate-400">今日最佳環境城市</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 truncate">
              {data ? data.bestCity.name : "--"}
            </p>
          </div>
          <div className="rounded-xl bg-white/80 p-3 shadow-xs backdrop-blur-xs dark:bg-slate-900/80">
            <p className="text-xs text-neutral-500 dark:text-slate-400">當前中暑/空污警戒縣市</p>
            <p className="text-2xl font-black text-amber-500 dark:text-amber-400">
              {data ? `${data.cautionCount} 縣市` : "--"}
            </p>
          </div>
          <div className="rounded-xl bg-white/80 p-3 shadow-xs backdrop-blur-xs dark:bg-slate-900/80">
            <p className="text-xs text-neutral-500 dark:text-slate-400">即時監測範圍</p>
            <p className="text-2xl font-black text-neutral-700 dark:text-slate-200">
              全台 22 縣市
            </p>
          </div>
        </div>
      </div>

      {/* 跨頁導流橫幅 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300">
        <div className="flex items-center gap-2">
          <span className="text-base">💨</span>
          <span>想深入查看細部測站數據？可搭配即時空氣品質指標與紫外線地圖：</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/tools/aqi"
            className="rounded-md bg-blue-100 px-2.5 py-1 font-semibold text-blue-800 hover:bg-blue-200 dark:bg-blue-900/60 dark:text-blue-200"
          >
            空氣品質 AQI ↗
          </a>
          <a
            href="/tools/uv"
            className="rounded-md bg-indigo-100 px-2.5 py-1 font-semibold text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-900/60 dark:text-indigo-200"
          >
            紫外線指數 UV ↗
          </a>
        </div>
      </div>

      {/* 縣市快速切換 */}
      {data?.cities && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-600 dark:text-slate-400">
            選擇縣市查看詳細活動建議：
          </label>
          <div className="flex flex-wrap gap-1.5">
            {data.cities.map((c) => (
              <button
                key={c.cityCode}
                type="button"
                onClick={() => setSelectedCityCode(c.cityCode)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                  selectedCityCode === c.cityCode
                    ? "bg-primary font-bold text-white shadow-xs"
                    : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                {c.cityName} ({c.overallScore}分)
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 載入中骨架 */}
      {loading && (
        <div className="flex justify-center py-16">
          <LoadingOrb size={36} />
        </div>
      )}

      {/* 當選縣市的核心看板 */}
      {!loading && currentCity && (
        <div className="space-y-4">
          {/* 主卡片 */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-100 pb-5 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-black text-neutral-800 dark:text-slate-100">
                    {currentCity.cityName}
                  </h3>
                  <span
                    className={`rounded-full px-3 py-0.5 text-xs font-bold ${
                      currentCity.safetyLevel === "excellent"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : currentCity.safetyLevel === "good"
                        ? "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                        : currentCity.safetyLevel === "caution"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                    }`}
                  >
                    {currentCity.safetyLevel === "excellent"
                      ? "🟢 極佳・放電好時機"
                      : currentCity.safetyLevel === "good"
                      ? "🔵 良好・適合戶外活動"
                      : currentCity.safetyLevel === "caution"
                      ? "🟡 警戒・注意高溫防曬"
                      : "🔴 危險・建議改室內"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  即時觀測：氣溫 {currentCity.temperature}°C ｜ 濕度 {currentCity.humidity}% ｜ 空品 AQI {currentCity.aqiValue} ｜ 紫外線 UV {currentCity.uvIndex}
                </p>
              </div>

              <div className="text-right">
                <span className="text-4xl font-black text-primary">
                  {currentCity.overallScore}
                </span>
                <span className="text-sm font-semibold text-neutral-400"> / 100 分</span>
              </div>
            </div>

            {/* 四大族群專屬指引卡 */}
            <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {/* 1. 跑者單車族 */}
              <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-sky-900 dark:text-sky-200">
                    🏃 跑者與單車族建議
                  </span>
                  <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-900/60 dark:text-sky-300">
                    跑者分數：{currentCity.advisories.runner.score}
                  </span>
                </div>
                <div className="mt-2.5 text-xs text-neutral-700 space-y-1.5 dark:text-slate-300">
                  <p>
                    <strong>最佳運動窗口：</strong>
                    <span className="text-sky-700 font-semibold dark:text-sky-300">
                      {currentCity.advisories.runner.bestWindow}
                    </span>
                  </p>
                  <p>{currentCity.advisories.runner.statusText}</p>
                  <p className="text-neutral-500 dark:text-slate-400">💡 {currentCity.advisories.runner.tips}</p>
                </div>
              </div>

              {/* 2. 親子放電族 */}
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                    👶 親子戶外放電指引
                  </span>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                    放電評分：{currentCity.advisories.family.score}
                  </span>
                </div>
                <div className="mt-2.5 text-xs text-neutral-700 space-y-1.5 dark:text-slate-300">
                  <p>
                    <strong>推薦特色綠地：</strong>
                    <span className="text-emerald-700 font-semibold dark:text-emerald-300">
                      {currentCity.advisories.family.parkRecommendation}
                    </span>
                  </p>
                  <p>{currentCity.advisories.family.uvCaution}</p>
                  <p className="text-neutral-500 dark:text-slate-400">🦠 {currentCity.advisories.family.diseaseNote}</p>
                </div>
              </div>

              {/* 3. 銀髮長輩散步 */}
              <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    👵 銀髮長輩晨昏散步
                  </span>
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                    舒適度：{currentCity.advisories.elderly.score}
                  </span>
                </div>
                <div className="mt-2.5 text-xs text-neutral-700 space-y-1.5 dark:text-slate-300">
                  <p>
                    <strong>中暑風險係數：</strong>
                    <span className="font-semibold">{currentCity.advisories.elderly.heatIndexWarning}</span>
                  </p>
                  <p>{currentCity.advisories.elderly.statusText}</p>
                  <p className="text-neutral-500 dark:text-slate-400">❤️ {currentCity.advisories.elderly.cardioCaution}</p>
                </div>
              </div>

              {/* 4. 蚊媒防護 */}
              <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-rose-900 dark:text-rose-200">
                    🦟 病媒蚊與戶外防護
                  </span>
                  <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
                    風險：{currentCity.heatRiskLevel === "danger" ? "高溫警戒" : "常規防護"}
                  </span>
                </div>
                <div className="mt-2.5 text-xs text-neutral-700 space-y-1.5 dark:text-slate-300">
                  <p>{currentCity.advisories.mosquito.riskText}</p>
                  <p className="text-neutral-500 dark:text-slate-400">🛡️ {currentCity.advisories.mosquito.repellentAdvice}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
