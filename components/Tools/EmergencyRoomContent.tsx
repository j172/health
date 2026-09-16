"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { EmergencyRoomItem, EmergencyOverviewResult } from "@/lib/server/emergencyRooms/types";

const REGION_TABS = [
  { id: "", label: "全台責任醫院" },
  { id: "TPE,NTPC,KEE", label: "基北北" },
  { id: "TYCG,HSC,HCH,MAL", label: "桃竹苗" },
  { id: "TXG,CHW,NTO", label: "中彰投" },
  { id: "YUN,CYI,CHY,TNN", label: "雲嘉南" },
  { id: "KHH,PTT", label: "高屏" },
  { id: "ILA,HUA,TTT", label: "宜花東" },
  { id: "PEN,KIN,LIE", label: "外島" },
];

function SparklineSvg({
  points,
  color = "#6366f1",
}: {
  points?: number[];
  color?: string;
}) {
  if (!points || points.length < 2) {
    return (
      <div className="flex h-10 w-full items-center justify-center text-[10px] text-slate-400">
        累積時序中...
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points, min + 1);
  const width = 180;
  const height = 40;
  const padding = 4;

  const coords = points.map((val, idx) => {
    const x = padding + (idx / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / (max - min)) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = `M ${coords.join(" L ")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-36 overflow-visible"
      aria-hidden="true"
    >
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 終點圓點 */}
      {coords.length > 0 && (
        <circle
          cx={coords[coords.length - 1].split(",")[0]}
          cy={coords[coords.length - 1].split(",")[1]}
          r="3.5"
          fill={color}
        />
      )}
    </svg>
  );
}

export default function EmergencyRoomContent({
  initialData,
}: {
  initialData?: EmergencyOverviewResult;
}) {
  const [data, setData] = useState<EmergencyOverviewResult | undefined>(initialData);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [onlyFull, setOnlyFull] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emergency-rooms");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to refresh emergency rooms:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredHospitals = useMemo(() => {
    if (!data?.items) return [];
    return data.items.filter((item) => {
      if (selectedRegion) {
        const allowed = selectedRegion.split(",");
        if (!allowed.includes(item.city_code)) return false;
      }
      if (onlyCritical && item.congestion_level !== "critical") return false;
      if (onlyFull && !item.is_full_reported) return false;
      if (keyword.trim()) {
        const kw = keyword.trim().toLowerCase();
        const matchName = item.hospital_name.toLowerCase().includes(kw);
        const matchCity = item.city_name.toLowerCase().includes(kw);
        const matchArea = item.area_name?.toLowerCase().includes(kw) || false;
        if (!matchName && !matchCity && !matchArea) return false;
      }
      return true;
    });
  }, [data?.items, selectedRegion, onlyCritical, onlyFull, keyword]);

  return (
    <div className="space-y-8">
      {/* 1. 頂部全台急診現況摘要儀表板 */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-lg dark:bg-red-950/60">
                🚨
              </span>
              <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                全台急診即時壅塞監測看板
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              每 15 分鐘自動同步衛福部與各急救責任醫院最新回報數值 ｜ 建議輕症優先至診所就醫，將急診資源留給急重症
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={refreshData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              🔄 {loading ? "同步中..." : "重新整理"}
            </button>
          </div>
        </div>

        {/* 統計數字小卡 */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 dark:bg-slate-800/60 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500">全國急救責任醫院</span>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
              {data?.totalHospitals || 0}
              <span className="text-xs font-normal text-slate-500 ml-1">家</span>
            </p>
          </div>

          <div className="rounded-2xl bg-red-50 p-4 border border-red-100 dark:bg-red-950/30 dark:border-red-900/40">
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">119 滿線暫停後送</span>
            <p className="mt-1 text-2xl font-black text-red-600 dark:text-red-400">
              {data?.fullReportedCount || 0}
              <span className="text-xs font-normal text-red-500 ml-1">家警戒</span>
            </p>
          </div>

          <div className="rounded-2xl bg-amber-50 p-4 border border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/40">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">急診重度壅塞</span>
            <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">
              {data?.criticalCount || 0}
              <span className="text-xs font-normal text-amber-600 ml-1">家</span>
            </p>
          </div>

          <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">運作順暢醫院</span>
            <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">
              {data?.normalCount || 0}
              <span className="text-xs font-normal text-emerald-600 ml-1">家</span>
            </p>
          </div>
        </div>
      </div>

      {/* 2. 篩選工具列與地區切換 */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋醫院名稱、縣市或行政區（如：台大、林口長庚、北投）"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap gap-1.5">
            {REGION_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedRegion(tab.id)}
                className={`rounded-full px-3.5 py-1 text-xs font-bold transition-colors ${
                  selectedRegion === tab.id
                    ? "bg-indigo-600 text-white dark:bg-indigo-500 shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 text-xs font-bold">
            <label className="flex items-center gap-1.5 cursor-pointer text-red-600 dark:text-red-400">
              <input
                type="checkbox"
                checked={onlyFull}
                onChange={(e) => setOnlyFull(e.target.checked)}
                className="h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
              />
              🚨 只看 119 滿線
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-amber-600 dark:text-amber-400">
              <input
                type="checkbox"
                checked={onlyCritical}
                onChange={(e) => setOnlyCritical(e.target.checked)}
                className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              ⚠️ 只看重度壅塞
            </label>
          </div>
        </div>
      </div>

      {/* 3. 責任醫院列表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>共篩選出 {filteredHospitals.length} 所急救責任醫院</span>
          <span>依 119 通報狀態與等待看診人數自動排序</span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {filteredHospitals.map((hospital) => {
            const isCritical = hospital.congestion_level === "critical";
            const isBusy = hospital.congestion_level === "busy";
            const isExpanded = expandedCode === hospital.hospital_code;

            return (
              <div
                key={hospital.hospital_code}
                className={`overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all dark:bg-slate-900 ${
                  hospital.is_full_reported
                    ? "border-red-500 ring-2 ring-red-500/20 dark:border-red-600"
                    : isCritical
                    ? "border-amber-400 dark:border-amber-600/70"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                {/* 119 滿線最頂部警示紅條 */}
                {hospital.is_full_reported && (
                  <div className="bg-red-600 px-5 py-2 text-xs font-black tracking-wide text-white flex items-center justify-between animate-pulse">
                    <span>🚨 119 滿線通報中：急診量能飽和，非重大傷病請避免前往！</span>
                    <span>暫緩救護車後送</span>
                  </div>
                )}

                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">
                          {hospital.city_name} · {hospital.area_name || ""}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {hospital.hospital_level}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                            isCritical
                              ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                              : isBusy
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          }`}
                        >
                          {isCritical ? "🔴 嚴重壅塞" : isBusy ? "🟡 人潮偏多" : "🟢 正常就醫"}
                        </span>
                      </div>

                      <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900 dark:text-slate-100">
                        {hospital.hospital_name}
                      </h3>

                      <p className="mt-1 text-xs text-slate-500">
                        {hospital.address} {hospital.phone ? `｜ 📞 ${hospital.phone}` : ""}
                      </p>
                    </div>

                    {/* 24 小時人潮走勢圖 */}
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <span>過去 24 小時人潮走勢</span>
                        {hospital.trend_direction === "up" ? (
                          <span className="text-red-600 font-bold">🔺 上升中</span>
                        ) : hospital.trend_direction === "down" ? (
                          <span className="text-emerald-600 font-bold">🔻 趨緩中</span>
                        ) : (
                          <span className="text-slate-400">持平</span>
                        )}
                      </div>
                      <SparklineSvg
                        points={hospital.trend_sparkline}
                        color={isCritical ? "#ef4444" : isBusy ? "#f59e0b" : "#10b981"}
                      />
                    </div>
                  </div>

                  {/* 4 大即時核心指標數據 */}
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 dark:bg-slate-800/60 dark:border-slate-800">
                      <span className="text-xs font-medium text-slate-500">等待看診人數</span>
                      <p className="mt-1 text-2xl font-black text-indigo-600 dark:text-indigo-400">
                        {hospital.waiting_consultation}
                        <span className="text-xs font-normal text-slate-500 ml-1">人</span>
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 dark:bg-slate-800/60 dark:border-slate-800">
                      <span className="text-xs font-medium text-slate-500">等待推床人數</span>
                      <p className={`mt-1 text-2xl font-black ${hospital.waiting_bed > 5 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-slate-100"}`}>
                        {hospital.waiting_bed}
                        <span className="text-xs font-normal text-slate-500 ml-1">床</span>
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 dark:bg-slate-800/60 dark:border-slate-800">
                      <span className="text-xs font-medium text-slate-500">等待住院人數</span>
                      <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
                        {hospital.waiting_admission}
                        <span className="text-xs font-normal text-slate-500 ml-1">人</span>
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 dark:bg-slate-800/60 dark:border-slate-800">
                      <span className="text-xs font-medium text-slate-500">等待加護病房</span>
                      <p className={`mt-1 text-2xl font-black ${hospital.waiting_icu > 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}>
                        {hospital.waiting_icu}
                        <span className="text-xs font-normal text-slate-500 ml-1">人</span>
                      </p>
                    </div>
                  </div>

                  {/* 底部功能與展開 */}
                  <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 dark:border-slate-800 text-xs">
                    <span className="text-slate-400">
                      更新時間：{hospital.reported_at}
                    </span>

                    <div className="flex items-center gap-2">
                      {hospital.lat && hospital.lng && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${hospital.lat},${hospital.lng}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-bold text-slate-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          🗺️ 路線導航
                        </a>
                      )}
                      {hospital.phone && (
                        <a
                          href={`tel:${hospital.phone.replace(/[^0-9]/g, "")}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-bold text-slate-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          📞 聯絡電話
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedCode(isExpanded ? null : hospital.hospital_code)}
                        className="font-bold text-indigo-600 hover:underline dark:text-indigo-400 ml-2"
                      >
                        {isExpanded ? "收合就醫指引 ▲" : "錯峰就醫建議 ▼"}
                      </button>
                    </div>
                  </div>

                  {/* 展開後的錯峰就醫指引 */}
                  {isExpanded && (
                    <div className="mt-4 rounded-xl bg-indigo-50/70 p-4 text-xs leading-relaxed text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-200 space-y-1.5">
                      <p className="font-extrabold text-sm">💡 急診就醫與避開尖峰建議：</p>
                      <p>• <strong>尖峰時段預警</strong>：依據急診歷史數據，每日晚間 19:00 至 23:00 為就醫最高峰，平均候診時間增加 40% 以上。</p>
                      <p>• <strong>檢傷分類機制</strong>：急診採檢傷分類（一級復甦急救、二級危急、三級緊急、四級次緊急、五級非緊急），非生命危急病患須配合等候急重症病患優先處置。</p>
                      <p>• <strong>輕症就醫替代方案</strong>：若屬輕微發燒、一般腸胃不適或擦傷，建議善用白天基層診所就診，可節省大幅等候時間與急診部分負擔費用。</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
