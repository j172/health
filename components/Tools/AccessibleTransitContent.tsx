"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import type {
  AccessibleTransitRoute,
  AccessibleTransitFacility,
  AccessibleTransitHotline,
  TransitAccessibilityOverview,
  TransitSystemType,
} from "@/lib/server/transit/types";

const SYSTEM_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  all: { label: "全部系統", icon: "🌐" },
  bus: { label: "低地板公車", icon: "🚌" },
  metro: { label: "捷運／輕軌", icon: "🚇" },
  rail: { label: "台鐵愛心服務", icon: "🚆" },
  hsrail: { label: "台灣高鐵", icon: "🚄" },
  rehab_bus: { label: "復康巴士專線", icon: "🚐" },
  accessible_taxi: { label: "通用計程車", icon: "🚕" },
};

export default function AccessibleTransitContent() {
  const [data, setData] = useState<TransitAccessibilityOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCounty, setSelectedCounty] = useState<string>("all");
  const [selectedSystem, setSelectedSystem] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedCounty !== "all") params.set("county", selectedCounty);
        if (selectedSystem !== "all") params.set("systemType", selectedSystem);
        if (searchQuery.trim()) params.set("query", searchQuery.trim());

        const res = await fetchWithTimeout(`/api/accessible-transit?${params.toString()}`, { timeoutMs: 5000 });
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to load transit data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedCounty, selectedSystem, searchQuery]);

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard?.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const counties = data?.counties || [
    "臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
    "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "臺南市",
    "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* 頂部跨頁導流與標題 */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-teal-700 text-white rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-md mb-4">
            <span>♿ 交通部 TDX ＋ 衛福部通用無障礙資料</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>22 縣市即時覆蓋</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            全台無障礙通用交通地圖
          </h1>
          <p className="text-blue-100 text-base sm:text-lg leading-relaxed mb-6">
            專為高齡長輩、輪椅朋友與推嬰兒車家長打造：快速掌握低地板公車配置比率、雙鐵捷運愛心渡板與預約、全台 22 縣市復康巴士派車中心與無障礙計程車專線。
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/tools/metro-alerts"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>🚇</span>
              <span>捷運營運與電梯檢修公告</span>
            </Link>
            <Link
              href="/tools/long-term-care"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>🏥</span>
              <span>長照服務機構查詢</span>
            </Link>
            <Link
              href="/tools/disability-atm"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>🏧</span>
              <span>無障礙 ATM 據點</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 摘要概況卡片 */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              主力無障礙幹線
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {data.summary.totalRoutes} <span className="text-sm font-normal text-slate-500">條路線</span>
            </div>
            <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              全配比路線 {data.summary.allLowFloorCount} 條
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              平均低地板比率
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {data.summary.avgLowFloorRatio}%
            </div>
            <div className="mt-1 text-xs text-slate-500">
              每車皆設 2 席輪椅固定座
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              復康巴士調度處
            </div>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {data.summary.rehabAgenciesCount} <span className="text-sm font-normal text-slate-500">個縣市</span>
            </div>
            <div className="mt-1 text-xs text-indigo-500">支援就醫預約接送</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              雙鐵捷運渡板預約
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              全程站務導引
            </div>
            <div className="mt-1 text-xs text-slate-500">抵達前專線預約免等待</div>
          </div>
        </div>
      )}

      {/* 篩選與搜尋工具列 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          {/* 縣市選擇 */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-thin">
            <span className="text-xs font-bold text-slate-400 whitespace-nowrap">縣市：</span>
            <button
              onClick={() => setSelectedCounty("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedCounty === "all"
                  ? "bg-blue-600 text-white shadow-sm"
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
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* 搜尋關鍵字 */}
          <div className="relative min-w-[220px]">
            <input
              type="text"
              placeholder="搜尋公車路線、醫院或電話..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2 pl-9 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>
        </div>

        {/* 系統類型 Tabs */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          {Object.entries(SYSTEM_TYPE_LABELS).map(([key, item]) => (
            <button
              key={key}
              onClick={() => setSelectedSystem(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                selectedSystem === key
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 資料展示區 */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-3 text-sm text-slate-500">正在聚合各縣市無障礙交通資訊...</p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* 1. 復康巴士專區 */}
          {(selectedSystem === "all" || selectedSystem === "rehab_bus") && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>🚐</span>
                  <span>各縣市復康巴士調度與預約專線</span>
                </h2>
                <span className="text-xs text-slate-500">
                  共 {data?.hotlines.length || 0} 處專線
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data?.hotlines.map((h, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                          {h.county}
                        </span>
                        <span className="text-xs text-slate-400">{h.serviceHours}</span>
                      </div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">
                        {h.name}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                        {h.description}
                      </p>
                      <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg text-xs text-slate-500 dark:text-slate-400 mb-4">
                        <strong className="text-slate-700 dark:text-slate-300">適用資格：</strong>
                        {h.eligibility}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                      <a
                        href={`tel:${h.phone.replace(/[^0-9]/g, "")}`}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm"
                      >
                        <span>📞</span>
                        <span>播打電話 {h.phone}</span>
                      </a>
                      <button
                        onClick={() => handleCopyPhone(h.phone)}
                        className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs transition"
                        title="複製電話號碼"
                      >
                        {copiedPhone === h.phone ? "已複製!" : "複製"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. 軌道運輸與通用計程車無障礙設施 */}
          {(selectedSystem === "all" ||
            selectedSystem === "metro" ||
            selectedSystem === "rail" ||
            selectedSystem === "hsrail" ||
            selectedSystem === "accessible_taxi") && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>🚇</span>
                  <span>雙鐵、捷運與通用無障礙計程車服務</span>
                </h2>
                <span className="text-xs text-slate-500">
                  共 {data?.facilities.length || 0} 項設施支援
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data?.facilities.map((f, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mr-2">
                          {f.county}
                        </span>
                        <span className="text-xs font-medium text-slate-500">
                          {f.stationOrAgency}
                        </span>
                      </div>
                      <span className="text-lg">
                        {SYSTEM_TYPE_LABELS[f.systemType]?.icon || "♿"}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      {f.facilityName}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                      {f.bookingRules}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {f.features.map((feat, fIdx) => (
                        <span
                          key={fIdx}
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                        >
                          ✓ {feat}
                        </span>
                      ))}
                    </div>

                    {f.servicePhone && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                        <span className="text-xs text-slate-500">預約或客服專線：</span>
                        <a
                          href={`tel:${f.servicePhone.replace(/[^0-9]/g, "")}`}
                          className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          📞 {f.servicePhone}
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. 低地板公車主力路線 */}
          {(selectedSystem === "all" || selectedSystem === "bus") && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>🚌</span>
                  <span>主力低地板公車無障礙路線</span>
                </h2>
                <span className="text-xs text-slate-500">
                  共 {data?.routes.length || 0} 條推薦就醫交通路線
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data?.routes.map((r, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                          {r.county}
                        </span>
                        <span className="text-xs font-medium text-slate-400">
                          {r.operatorName}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2">
                        {r.routeName}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                        {r.description}
                      </p>
                    </div>

                    <div>
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-xs font-medium mb-1">
                          <span className="text-slate-500">低地板車隊比率</span>
                          <span
                            className={
                              r.lowFloorRatio >= 95
                                ? "text-emerald-600 font-bold"
                                : "text-blue-600 font-bold"
                            }
                          >
                            {r.lowFloorRatio}%
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              r.lowFloorRatio >= 95 ? "bg-emerald-500" : "bg-blue-500"
                            }`}
                            style={{ width: `${r.lowFloorRatio}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <span>輪椅席位：{r.wheelchairSlots} 席/車</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {r.isAllLowFloor ? "★ 全低地板班次" : "高比例低地板"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
