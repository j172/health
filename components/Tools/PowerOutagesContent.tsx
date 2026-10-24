"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import type { PowerOutagesResponse, PowerOutageIncident } from "@/lib/server/power/outageParser";

const PowerOutagesMap = dynamic(() => import("./PowerOutagesMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[450px] sm:h-[550px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <div className="flex flex-col items-center gap-2">
        <span className="text-2xl animate-bounce">⚡</span>
        <span>正在載入全臺即時停電空間圖資…</span>
      </div>
    </div>
  ),
});

const FALLBACK_OUTAGES: PowerOutagesResponse = {
  totalOutageCount: 0,
  affectedVillagesCount: 0,
  countySummaries: [],
  incidents: [],
  updatedAt: new Date().toISOString(),
};

export default function PowerOutagesContent() {
  const [data, setData] = useState<PowerOutagesResponse>(FALLBACK_OUTAGES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCounty, setSelectedCounty] = useState<string>("all");
  const [selectedTownship, setSelectedTownship] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [focusedCoord, setFocusedCoord] = useState<[number, number] | null>(null);

  const fetchData = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`/api/power-outages${force ? "?refresh=true" : ""}`, {
        timeoutMs: 12_000,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        throw new Error(json.error || "資料格式不正確");
      }
    } catch (err: any) {
      console.error("Failed to load power outages data:", err);
      setError("無法取得即時停電資料，請稍後重試。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // County options from countySummaries or incidents
  const counties = useMemo(() => {
    const set = new Set<string>();
    for (const c of data.countySummaries) {
      if (c.county) set.add(c.county);
    }
    for (const inc of data.incidents) {
      if (inc.county) set.add(inc.county);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [data]);

  // Townships filtered by selected county
  const townships = useMemo(() => {
    const set = new Set<string>();
    for (const inc of data.incidents) {
      if (selectedCounty === "all" || inc.county === selectedCounty) {
        if (inc.township) set.add(inc.township);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [data.incidents, selectedCounty]);

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    return data.incidents.filter((inc) => {
      if (selectedCounty !== "all" && inc.county !== selectedCounty) return false;
      if (selectedTownship !== "all" && inc.township !== selectedTownship) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesArea = `${inc.county}${inc.township}${inc.village}`.toLowerCase().includes(q);
        if (!matchesArea) return false;
      }
      return true;
    });
  }, [data.incidents, selectedCounty, selectedTownship, searchQuery]);

  const topCountySummary = data.countySummaries[0];

  const handleLocateIncident = (inc: PowerOutageIncident) => {
    if (inc.coordinates && inc.coordinates.length > 0) {
      let sumLat = 0;
      let sumLng = 0;
      let count = 0;
      for (const [lng, lat] of inc.coordinates) {
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          sumLat += lat;
          sumLng += lng;
          count++;
        }
      }
      if (count > 0) {
        setFocusedCoord([sumLat / count, sumLng / count]);
        // Smooth scroll to map
        window.scrollTo({ top: 120, behavior: "smooth" });
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Notification / Data status */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            台電即時資料同步時間：
            <span className="font-mono text-slate-900 dark:text-slate-100 ml-1">
              {data.updatedAt || "最新檢核中"}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <span className={loading ? "animate-spin" : ""}>🔄</span>
            <span>{loading ? "更新中…" : "立即重新整理"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          ⚠️ {error}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Outages */}
        <div className="flex flex-col justify-between rounded-2xl border border-rose-100 bg-rose-50/50 p-5 shadow-xs dark:border-rose-900/30 dark:bg-rose-950/20">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-rose-700 dark:text-rose-400">
              <span>全臺停電總戶數</span>
              <span className="text-base">⚡</span>
            </div>
            <div className="mt-2 text-3xl font-extrabold tracking-tight text-rose-700 dark:text-rose-300">
              {data.totalOutageCount.toLocaleString()}
              <span className="text-sm font-normal text-slate-600 dark:text-slate-400 ml-1">戶</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {data.totalOutageCount === 0 ? "目前全臺供電正常無大規模停電" : "包含線路檢修與突發跳脫"}
          </div>
        </div>

        {/* Affected Villages */}
        <div className="flex flex-col justify-between rounded-2xl border border-amber-100 bg-amber-50/50 p-5 shadow-xs dark:border-amber-900/30 dark:bg-amber-950/20">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-amber-700 dark:text-amber-400">
              <span>受影響村里數</span>
              <span className="text-base">🏘️</span>
            </div>
            <div className="mt-2 text-3xl font-extrabold tracking-tight text-amber-700 dark:text-amber-300">
              {data.affectedVillagesCount.toLocaleString()}
              <span className="text-sm font-normal text-slate-600 dark:text-slate-400 ml-1">個里</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            台電公告劃定空間圖資範圍
          </div>
        </div>

        {/* Top Affected County */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
              <span>主要停電縣市</span>
              <span className="text-base">📍</span>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {topCountySummary ? (
                <>
                  {topCountySummary.county}
                  <span className="text-sm font-normal text-rose-600 dark:text-rose-400 ml-1.5">
                    ({topCountySummary.outageCount.toLocaleString()} 戶)
                  </span>
                </>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 text-lg">全臺皆無停電</span>
              )}
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {data.countySummaries.length > 1
              ? `共 ${data.countySummaries.length} 個縣市有停電紀錄`
              : "即時排定優先搶修順序"}
          </div>
        </div>

        {/* 1911 Call Button Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-red-200 bg-red-600 p-5 text-white shadow-sm hover:bg-red-700 transition">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-red-100">
              <span>台電 24H 報修專線</span>
              <span className="text-base">📞</span>
            </div>
            <div className="mt-2 text-3xl font-extrabold tracking-tight">1911</div>
          </div>
          <div className="mt-3">
            <a
              href="tel:1911"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-red-600 shadow-sm transition hover:bg-red-50 active:scale-95"
            >
              📞 一鍵撥打 1911 報案
            </a>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          {/* County Selector */}
          <select
            value={selectedCounty}
            onChange={(e) => {
              setSelectedCounty(e.target.value);
              setSelectedTownship("all");
            }}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 transition focus:border-red-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">全臺灣（全部縣市）</option>
            {counties.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Township Selector */}
          <select
            value={selectedTownship}
            onChange={(e) => setSelectedTownship(e.target.value)}
            disabled={selectedCounty === "all" && townships.length === 0}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 transition focus:border-red-500 focus:outline-hidden disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">全部鄉鎮市區</option>
            {townships.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Keyword Search Input */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋村里或行政區..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pl-8 text-xs text-slate-900 placeholder-slate-400 transition focus:border-red-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
          />
          <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Interactive Map */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <span>🗺️</span>
            <span>即時停電空間圖資地圖</span>
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            點擊紅色/橙色多邊形查看復電時間與 1911 直撥
          </span>
        </div>
        <PowerOutagesMap
          incidents={filteredIncidents}
          focusCoord={focusedCoord}
        />
      </div>

      {/* Incidents List / Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <span>📋</span>
            <span>
              受影響村里搶修清單（共 {filteredIncidents.length} 處）
            </span>
          </h2>
        </div>

        {filteredIncidents.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <span className="text-4xl">🎉</span>
            <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
              目前無停電災情通報
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              若您所處區域突發停電，可能是您住家個別線路或開關箱跳脫，請撥打 1911 台電專線洽詢。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredIncidents.map((inc) => (
              <div
                key={inc.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-red-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-red-800"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {inc.county} {inc.township}
                      </span>
                      <h3 className="mt-1.5 text-base font-bold text-slate-900 dark:text-slate-100">
                        {inc.village}
                      </h3>
                    </div>
                    <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-400">
                      {inc.outageCount.toLocaleString()} 戶
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <p>
                      <span className="text-slate-400">預計復電：</span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {inc.restoreTime ?? "查修中 (暫無預估時間)"}
                      </span>
                    </p>
                    <p>
                      <span className="text-slate-400">更新時間：</span>
                      <span>{inc.updateTime}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleLocateIncident(inc)}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-center text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    📍 地圖定位
                  </button>
                  <a
                    href={`tel:${inc.contactPhone || "1911"}`}
                    className="flex-1 rounded-lg bg-red-600 py-1.5 text-center text-xs font-bold text-white transition hover:bg-red-700"
                  >
                    📞 報修 1911
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contextual link cards (維生管線三聯動情境導流) */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/60">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">
          維生管線與水電防災快速導流
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/tools/water-outages"
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition hover:border-indigo-400 hover:shadow-xs dark:border-slate-700 dark:bg-slate-800"
          >
            <span className="text-2xl">🚰</span>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                全臺即時停水地圖
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                查詢破管施工與緊急取水站
              </div>
            </div>
          </Link>

          <Link
            href="/tools/power-grid-overview"
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition hover:border-indigo-400 hover:shadow-xs dark:border-slate-700 dark:bg-slate-800"
          >
            <span className="text-2xl">⚡</span>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                全臺電力概況儀表板
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                各機組即時發電與備轉容量
              </div>
            </div>
          </Link>

          <Link
            href="/guides/typhoon-earthquake"
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition hover:border-indigo-400 hover:shadow-xs dark:border-slate-700 dark:bg-slate-800"
          >
            <span className="text-2xl">🚨</span>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                颱風地震防災指南
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                緊急避難包與居家儲備手冊
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
