"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import type { HotlineRecord } from "@/lib/server/hotlines/hotlinesQueries";
import { COUNTY_1999_LIST, type County1999Info } from "@/lib/server/hotlines/county1999";
import { useGeolocation } from "@/components/Facilities/useGeolocation";

interface Props {
  initialHotlines: HotlineRecord[];
}

const CATEGORY_TABS = [
  { id: "all", label: "全部專線", icon: "📋" },
  { id: "緊急救難", label: "緊急救難", icon: "🚨" },
  { id: "弱勢保護", label: "弱勢保護", icon: "🛡️" },
  { id: "民生水電", label: "民生水電", icon: "⚡" },
  { id: "心理輔導", label: "心理協談", icon: "🧠" },
  { id: "治安諮詢", label: "治安反詐", icon: "👮" },
  { id: "交通路況", label: "交通路況", icon: "🚗" },
  { id: "衛生醫療", label: "衛生長照", icon: "🏥" },
  { id: "勞工權益", label: "勞動就業", icon: "💼" },
  { id: "法律扶助", label: "法律廉政", icon: "⚖️" },
  { id: "市政服務", label: "市政便民", icon: "🏛️" },
];

const COUNTY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  KEE: { lat: 25.1276, lng: 121.7392 },
  TPE: { lat: 25.033, lng: 121.5654 },
  NTPC: { lat: 25.0169, lng: 121.4627 },
  TYCG: { lat: 24.9936, lng: 121.3009 },
  HSC: { lat: 24.8138, lng: 120.9675 },
  HCH: { lat: 24.8387, lng: 121.0177 },
  MAL: { lat: 24.5602, lng: 120.8214 },
  TXG: { lat: 24.1618, lng: 120.6469 },
  CHW: { lat: 24.0518, lng: 120.5161 },
  NTO: { lat: 23.9609, lng: 120.9719 },
  YUN: { lat: 23.7092, lng: 120.4313 },
  CYI: { lat: 23.48, lng: 120.4491 },
  CHY: { lat: 23.4518, lng: 120.2559 },
  TNN: { lat: 22.9997, lng: 120.227 },
  KHH: { lat: 22.6273, lng: 120.3014 },
  PTT: { lat: 22.6828, lng: 120.4879 },
  ILA: { lat: 24.7021, lng: 121.7377 },
  HUA: { lat: 23.9871, lng: 121.6016 },
  TTT: { lat: 22.7583, lng: 121.1444 },
  PEN: { lat: 23.5711, lng: 119.5793 },
  KIN: { lat: 24.4493, lng: 118.3766 },
  LIE: { lat: 26.1558, lng: 119.9397 },
};

function getCleanTel(num: string): string {
  return num.replace(/[^\d+]/g, "");
}

export default function EmergencyHotlinesContent({ initialHotlines }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedCountyCode, setSelectedCountyCode] = useState("TPE");
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);

  const geo = useGeolocation();

  // Auto-select nearest county on GPS resolution if not default
  useEffect(() => {
    if (!geo.loading && !geo.isDefault && geo.lat && geo.lng) {
      let closestCode = "TPE";
      let minDistance = Infinity;

      for (const [code, pos] of Object.entries(COUNTY_CENTROIDS)) {
        const d = (geo.lat - pos.lat) ** 2 + (geo.lng - pos.lng) ** 2;
        if (d < minDistance) {
          minDistance = d;
          closestCode = code;
        }
      }
      setSelectedCountyCode(closestCode);
    }
  }, [geo.loading, geo.isDefault, geo.lat, geo.lng]);

  const selectedCounty: County1999Info = useMemo(() => {
    return (
      COUNTY_1999_LIST.find((c) => c.code === selectedCountyCode) ||
      COUNTY_1999_LIST[1] // Default Taipei
    );
  }, [selectedCountyCode]);

  const handleCopy = useCallback((text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedNumber(text);
      setTimeout(() => setCopiedNumber(null), 2000);
    }
  }, []);

  // Filtered hotlines
  const filteredHotlines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return initialHotlines.filter((item) => {
      // Category match
      if (selectedCategory !== "all") {
        const cat = item.category || "";
        if (!cat.includes(selectedCategory)) {
          // Broad mappings
          if (selectedCategory === "緊急救難" && !cat.includes("緊急") && !cat.includes("報案")) return false;
          if (selectedCategory === "衛生醫療" && !cat.includes("衛生") && !cat.includes("醫療") && !cat.includes("長照") && !cat.includes("食藥")) return false;
          if (selectedCategory === "勞工權益" && !cat.includes("勞工") && !cat.includes("就業")) return false;
          if (selectedCategory === "法律扶助" && !cat.includes("法律") && !cat.includes("廉政")) return false;
          if (selectedCategory === "治安諮詢" && !cat.includes("治安") && !cat.includes("防詐") && !cat.includes("安全")) return false;
          if (
            !cat.includes(selectedCategory) &&
            !cat.includes("緊急") &&
            !cat.includes("報案") &&
            !cat.includes("衛生") &&
            !cat.includes("勞工") &&
            !cat.includes("法律")
          ) {
            return false;
          }
        }
      }

      // Keyword match
      if (!q) return true;

      const num = item.number.toLowerCase();
      const name = item.name.toLowerCase();
      const agency = item.agency.toLowerCase();
      const desc = (item.description || "").toLowerCase();
      const cat = (item.category || "").toLowerCase();
      const alt = (item.alternative_number || "").toLowerCase();

      return (
        num.includes(q) ||
        name.includes(q) ||
        agency.includes(q) ||
        desc.includes(q) ||
        cat.includes(q) ||
        alt.includes(q)
      );
    });
  }, [initialHotlines, selectedCategory, searchQuery]);

  return (
    <div className="space-y-8">
      {/* ========================================================= */}
      {/* 1. TOP CRITICAL ACTIONS: 五大極限急難卡片 (High Contrast) */}
      {/* ========================================================= */}
      <section aria-labelledby="critical-numbers-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="critical-numbers-title" className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            急難專線一鍵直撥
          </h2>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            點擊號碼直接通話
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {/* 110 */}
          <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 p-4 text-white shadow-lg transition-transform hover:-translate-y-1">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-blue-200">
              <span>警察報案</span>
              <span className="rounded bg-blue-500/30 px-1.5 py-0.5 text-[10px]">免付費</span>
            </div>
            <a
              href="tel:110"
              className="my-2 block text-center text-4xl font-black tracking-tight text-white drop-shadow hover:text-blue-100"
              aria-label="撥打 110 警察報案專線"
            >
              110
            </a>
            <p className="text-center text-xs text-blue-100/90 font-medium">
              治安刑事 / 交通事故 / 突發危難
            </p>
            <div className="mt-3 border-t border-blue-400/20 pt-2 text-center text-[10px] text-blue-200/80">
              聽語障簡訊：0911-511-110
            </div>
          </div>

          {/* 119 */}
          <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-700 via-red-800 to-amber-950 p-4 text-white shadow-lg transition-transform hover:-translate-y-1">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-red-200">
              <span>消防救護</span>
              <span className="rounded bg-red-500/30 px-1.5 py-0.5 text-[10px]">免付費</span>
            </div>
            <a
              href="tel:119"
              className="my-2 block text-center text-4xl font-black tracking-tight text-white drop-shadow hover:text-red-100"
              aria-label="撥打 119 消防救護專線"
            >
              119
            </a>
            <p className="text-center text-xs text-red-100/90 font-medium">
              火警滅火 / 緊急送醫 / 災害搜救
            </p>
            <div className="mt-3 border-t border-red-400/20 pt-2 text-center text-[10px] text-red-200/80">
              聽語障簡訊：0911-511-119
            </div>
          </div>

          {/* 112 */}
          <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600 via-orange-700 to-stone-900 p-4 text-white shadow-lg transition-transform hover:-translate-y-1">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-amber-200">
              <span>全球行動求救</span>
              <span className="rounded bg-amber-500/30 px-1.5 py-0.5 text-[10px]">微弱訊號</span>
            </div>
            <a
              href="tel:112"
              className="my-2 block text-center text-4xl font-black tracking-tight text-white drop-shadow hover:text-amber-100"
              aria-label="撥打 112 全球行動電話緊急專線"
            >
              112
            </a>
            <p className="text-center text-xs text-amber-100/90 font-medium">
              無SIM卡 / 任何基地台皆可通
            </p>
            <div className="mt-3 border-t border-amber-400/20 pt-2 text-center text-[10px] text-amber-200/80">
              按 0 轉接 110、按 9 轉接 119
            </div>
          </div>

          {/* 113 */}
          <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-700 via-indigo-900 to-slate-900 p-4 text-white shadow-lg transition-transform hover:-translate-y-1">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-purple-200">
              <span>婦幼保護</span>
              <span className="rounded bg-purple-500/30 px-1.5 py-0.5 text-[10px]">免付費</span>
            </div>
            <a
              href="tel:113"
              className="my-2 block text-center text-4xl font-black tracking-tight text-white drop-shadow hover:text-purple-100"
              aria-label="撥打 113 全國保護專線"
            >
              113
            </a>
            <p className="text-center text-xs text-purple-100/90 font-medium">
              家庭暴力 / 性侵性騷 / 兒少虐待
            </p>
            <div className="mt-3 border-t border-purple-400/20 pt-2 text-center text-[10px] text-purple-200/80">
              24小時專人 / 隱私通報救援
            </div>
          </div>

          {/* 118 */}
          <div className="col-span-2 sm:col-span-1 group relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-700 via-cyan-800 to-slate-900 p-4 text-white shadow-lg transition-transform hover:-translate-y-1">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-teal-200">
              <span>海巡救難</span>
              <span className="rounded bg-teal-500/30 px-1.5 py-0.5 text-[10px]">免付費</span>
            </div>
            <a
              href="tel:118"
              className="my-2 block text-center text-4xl font-black tracking-tight text-white drop-shadow hover:text-teal-100"
              aria-label="撥打 118 海難與海巡服務專線"
            >
              118
            </a>
            <p className="text-center text-xs text-teal-100/90 font-medium">
              海邊溺水 / 海上搜救 / 沿海走私
            </p>
            <div className="mt-3 border-t border-teal-400/20 pt-2 text-center text-[10px] text-teal-200/80">
              海洋委員會海巡署 24H 執勤
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 2. 1999 全臺 22 縣市智慧切換器 (在地簡碼 vs 外縣市代表號) */}
      {/* ========================================================= */}
      <section
        aria-labelledby="county-1999-title"
        className="overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-b from-indigo-50/70 via-white to-white p-5 shadow-sm dark:border-indigo-900/50 dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-900"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 id="county-1999-title" className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-xs font-black text-white">
                1999
              </span>
              各縣市市民服務專線速查
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              💡 手機撥打或人在外縣市請撥「直撥代表號」，以確保正確轉接該市府並享有市話費率。
            </p>
          </div>

          <button
            type="button"
            onClick={() => geo.refresh()}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <span>📍</span>
            <span>{geo.loading ? "定位中..." : "重新自動定位縣市"}</span>
          </button>
        </div>

        {/* County Chip Selector */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {COUNTY_1999_LIST.map((c) => {
            const isSelected = c.code === selectedCountyCode;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => setSelectedCountyCode(c.code)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        {/* Selected County Action Card */}
        <div className="mt-4 rounded-xl border border-indigo-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  {selectedCounty.name}
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {selectedCounty.note}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                本縣市境內撥打請按 <strong className="text-indigo-600 dark:text-indigo-400">1999</strong>；手機或外縣市撥打請撥市話代表號。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="tel:1999"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow transition hover:bg-emerald-500"
                aria-label={`境內撥打 1999 ${selectedCounty.name}`}
              >
                <span>📞</span>
                <span>境內撥 1999</span>
              </a>

              <a
                href={`tel:${getCleanTel(selectedCounty.directPhone)}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow transition hover:bg-indigo-500"
                aria-label={`手機或外縣市直撥 ${selectedCounty.name} ${selectedCounty.dialDisplay}`}
              >
                <span>📱</span>
                <span>直撥 {selectedCounty.dialDisplay}</span>
              </a>

              <button
                type="button"
                onClick={() => handleCopy(selectedCounty.dialDisplay)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                {copiedNumber === selectedCounty.dialDisplay ? "✓ 已複製" : "複製號碼"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. SEARCH & QUICK FILTER PILLS                            */}
      {/* ========================================================= */}
      <section aria-labelledby="hotline-directory-title" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 id="hotline-directory-title" className="text-xl font-bold text-slate-900 dark:text-white">
            全臺政府公務與急難專線目錄 ({filteredHotlines.length} 筆)
          </h3>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋專線、號碼、停電、長照..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-slate-400">
              🔍
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="清除搜尋"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
          {CATEGORY_TABS.map((tab) => {
            const isSelected = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  isSelected
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow"
                    : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ========================================================= */}
        {/* 4. COMPREHENSIVE HOTLINE CARDS                            */}
        {/* ========================================================= */}
        {filteredHotlines.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <span className="text-3xl">🔍</span>
            <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              找不到符合「{searchQuery}」的專線
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              若遇立即之生命危險或重大災害，請直接撥打 <strong>110</strong> 或 <strong>119</strong>。
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
              className="mt-3 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-400"
            >
              重設搜尋條件
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredHotlines.map((item) => {
              const cleanTel = getCleanTel(item.number);
              const isFree = item.billing.includes("免付費") || item.billing.includes("免費");

              return (
                <div
                  key={item.number}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    {/* Top Row: Category & Badges */}
                    <div className="flex items-center justify-between gap-1.5 text-xs">
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {item.agency}
                      </span>
                      <div className="flex items-center gap-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            isFree
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {item.billing}
                        </span>
                        {item.service_hours.includes("24") && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            24H
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Number & Name */}
                    <div className="mt-3 flex items-baseline justify-between">
                      <h4 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                        {item.number}
                      </h4>
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        {item.category}
                      </span>
                    </div>

                    <div className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
                      {item.name}
                    </div>

                    {/* Description */}
                    {item.description && (
                      <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-3">
                        {item.description}
                      </p>
                    )}

                    {/* Alternative / Notes */}
                    {item.alternative_number && (
                      <div className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">備用／替代：</span>
                        {item.alternative_number}
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Buttons */}
                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <a
                      href={`tel:${cleanTel}`}
                      className="flex-1 rounded-xl bg-indigo-600 py-2 text-center text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500 active:scale-95"
                      aria-label={`撥打 ${item.number} ${item.name}`}
                    >
                      📞 一鍵直撥
                    </a>

                    <button
                      type="button"
                      onClick={() => handleCopy(item.number)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      aria-label={`複製 ${item.number}`}
                    >
                      {copiedNumber === item.number ? "✓ 已複製" : "複製"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
