"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useGeolocation, GEO_DEFAULTS } from "@/components/Facilities/useGeolocation";
import MapLocationBanner from "@/components/Common/MapLocationBanner";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import type { FacilityListItem } from "@/lib/server/facilities/queries";

const AedMapLeaflet = dynamic(() => import("@/components/Tools/AedMapLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">
      載入 AED 互動式地圖中…
    </div>
  ),
});

interface AedExtra {
  locationDesc?: string;
  openHours?: string;
  category?: string;
  open24Hours?: boolean;
}

function checkIsOpenNow(openHoursStr?: string, is24h?: boolean): { isOpen: boolean; label: string; badgeColor: string } {
  if (is24h) {
    return { isOpen: true, label: "🟢 24小時隨時可取", badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" };
  }
  if (!openHoursStr) {
    return { isOpen: true, label: "⚪ 開放時間依現場為準", badgeColor: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700" };
  }

  const str = openHoursStr.toLowerCase();
  if (str.includes("24小時") || str.includes("全天候") || str.includes("24h")) {
    return { isOpen: true, label: "🟢 24小時隨時可取", badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" };
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeVal = currentHour * 60 + currentMinute;

  // 嘗試比對格式如 "08:00 - 17:30" 或 "06:00 ~ 24:00"
  const timeMatch = openHoursStr.match(/(\d{1,2}):(\d{2})\s*[-~至到]\s*(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const startVal = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
    const endVal = parseInt(timeMatch[3], 10) * 60 + parseInt(timeMatch[4], 10);

    if (currentTimeVal >= startVal && currentTimeVal <= endVal) {
      return { isOpen: true, label: "🟢 目前開放中", badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" };
    } else {
      return { isOpen: false, label: "🔴 非開放時間（已閉館）", badgeColor: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800" };
    }
  }

  return { isOpen: true, label: `🕒 ${openHoursStr}`, badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800" };
}

export default function AedContent({
  initialFacilities = [],
}: {
  initialFacilities?: FacilityListItem[];
}) {
  const geo = useGeolocation();
  const [facilities, setFacilities] = useState<FacilityListItem[]>(initialFacilities);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [onlyOpenNow, setOnlyOpenNow] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");

  const fetchAeds = useCallback(
    async (params: { kw?: string; lat?: number; lng?: number }) => {
      setLoading(true);
      setIsExpanded(false);
      try {
        const query = new URLSearchParams();
        query.set("type", "aed");
        if (params.kw) query.set("keyword", params.kw);
        if (params.lat !== undefined && params.lng !== undefined) {
          query.set("lat", String(params.lat));
          query.set("lng", String(params.lng));
          query.set("radius", "5000"); // 5km 半徑
        }
        query.set("limit", "80");

        const res = await fetchWithTimeout(`/api/facilities?${query.toString()}`, { timeoutMs: 5000 });
        if (res.ok) {
          const data = await res.json();
          let list = Array.isArray(data.facilities) ? data.facilities : [];

          // 若5km內無資料，自動放大半徑搜尋全區離使用者最近的AED，避免顯示空畫面
          if (list.length === 0 && params.lat !== undefined && params.lng !== undefined && !params.kw) {
            query.delete("radius");
            query.set("sort", "distance");
            const retryRes = await fetchWithTimeout(`/api/facilities?${query.toString()}`, { timeoutMs: 5000 });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              if (Array.isArray(retryData.facilities) && retryData.facilities.length > 0) {
                list = retryData.facilities;
                setIsExpanded(true);
              }
            }
          }

          setFacilities(list);
        }
      } catch (err) {
        console.error("Failed to fetch AED facilities:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchAeds({ lat: geo.lat || GEO_DEFAULTS.lat, lng: geo.lng || GEO_DEFAULTS.lng });
  }, [geo.lat, geo.lng, fetchAeds]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAeds({
      kw: keyword,
      lat: geo.lat || undefined,
      lng: geo.lng || undefined,
    });
  };

  const processedFacilities = useMemo(() => {
    return facilities
      .map((f) => {
        const extra = (f.extra_json as AedExtra) || {};
        const openInfo = checkIsOpenNow(f.service_time || extra.openHours, extra.open24Hours);
        return {
          ...f,
          extra,
          openInfo,
        };
      })
      .filter((f) => {
        if (onlyOpenNow && !f.openInfo.isOpen) return false;
        if (selectedCategory && f.extra.category && !f.extra.category.includes(selectedCategory)) {
          return false;
        }
        return true;
      });
  }, [facilities, onlyOpenNow, selectedCategory]);

  const closestThree = useMemo(() => {
    return processedFacilities.slice(0, 3);
  }, [processedFacilities]);

  return (
    <div className="space-y-6">
      {/* 1. 緊急救命置頂宣導條 */}
      <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-5 shadow-md dark:border-red-600 dark:bg-red-950/40">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-2xl text-white shadow-sm animate-pulse">
              ⚡
            </span>
            <div>
              <h2 className="text-lg font-black tracking-tight text-red-900 dark:text-red-100">
                爭取黃金急救 4 分鐘！CPR + AED 搶救生命
              </h2>
              <p className="mt-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                患者無意識、無呼吸時請立即呼救，撥打 119 並取下最近的 AED 依語音指示操作。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="tel:119"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white shadow-sm transition-all hover:bg-red-700 active:scale-95"
            >
              📞 立即撥打 119
            </a>
          </div>
        </div>
      </div>

      {/* 2. 地圖定位權限與狀態指引條 */}
      <MapLocationBanner location={geo} facilityTypeName="AED 設備" />

      {/* 3. 互動式 AED 設施地圖 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-bold flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
            <span>🗺️</span>
            <span>全國公共場所 AED 即時地圖</span>
            {isExpanded && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                周邊5km無設備，已自動擴大範圍
              </span>
            )}
          </span>
          <span>標示半徑 5km 搜尋範圍與詳細放置位置</span>
        </div>
        <div className="h-[380px] sm:h-[440px] w-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800">
          <AedMapLeaflet facilities={processedFacilities} userLocation={geo} radiusMeters={5000} />
        </div>
      </div>

      {/* 4. 黃金 4 分鐘 - 距離您最近的 3 台 AED */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-slate-100">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500 text-xs text-white">
              📍
            </span>
            距離您最近的 AED
            <span className="text-xs font-normal text-slate-500">（依 GPS 距離排列）</span>
          </h3>
          {geo.loading ? (
            <span className="text-xs text-slate-500 animate-pulse">正在精確定位中...</span>
          ) : geo.isDefault ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">⚠️ 採用預設定位，建議開啟瀏覽器定位權限</span>
          ) : (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">已自動定位</span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {closestThree.map((item, idx) => (
            <div
              key={item.id || idx}
              className="relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-indigo-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-xs font-black text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                    #{idx + 1}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${item.openInfo.badgeColor}`}>
                    {item.openInfo.label}
                  </span>
                </div>

                <h4 className="mt-3 text-base font-bold text-slate-900 line-clamp-1 dark:text-slate-100">
                  {item.name}
                </h4>

                {item.distance_km !== undefined && (
                  <p className="mt-1 text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                    距離約 {item.distance_km < 1 ? `${Math.round(item.distance_km * 1000)} 公尺` : `${item.distance_km} 公里`}
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      (步行約 {Math.max(1, Math.round((item.distance_km * 1000) / 70))} 分鐘)
                    </span>
                  </p>
                )}

                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                  <p className="font-bold text-indigo-600 dark:text-indigo-400">
                    📍 放置地點：
                  </p>
                  <p className="mt-1 font-semibold">{item.service_item || item.extra.locationDesc || "請洽詢現場服務台"}</p>
                </div>

                {item.address && (
                  <p className="mt-2 text-xs text-slate-500 line-clamp-1">
                    {item.address}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 dark:border-slate-800">
                {item.lat && item.lng ? (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700"
                  >
                    🗺️ 一鍵導航
                  </a>
                ) : null}
                {item.phone && (
                  <a
                    href={`tel:${item.phone.replace(/[^0-9]/g, "")}`}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    📞 管理電話
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 搜尋與過濾工具列 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋場所名稱（如：高鐵、捷運、學校、活動中心）或地址"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-xs transition-colors hover:bg-indigo-700"
          >
            🔍 搜尋 AED
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "", label: "全部場所" },
              { id: "交通要道", label: "🚆 交通要道" },
              { id: "觀光旅遊", label: "🏞️ 觀光旅遊" },
              { id: "學校", label: "🏫 學校機構" },
              { id: "政府機關", label: "🏛️ 公務機關" },
              { id: "體育運動", label: "🏟️ 體育運動" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  selectedCategory === tab.id
                    ? "bg-indigo-600 text-white dark:bg-indigo-500"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer dark:text-slate-300">
            <input
              type="checkbox"
              checked={onlyOpenNow}
              onChange={(e) => setOnlyOpenNow(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            ⚡ 只顯示目前開放中（過濾已閉館鎖門場所）
          </label>
        </div>
      </div>

      {/* 4. 完整 AED 列表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>共找到 {processedFacilities.length} 處 AED 設備</span>
          <span>資料每日同步：衛生福利部醫事司</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500 animate-pulse">
            載入 AED 設備資料中...
          </div>
        ) : processedFacilities.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            查無符合條件的 AED 設置地點，請嘗試變更關鍵字或取消「只顯示開放中」篩選。
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {processedFacilities.map((item) => (
              <div key={item.id} className="p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-base dark:text-slate-100">
                      {item.name}
                    </span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${item.openInfo.badgeColor}`}>
                      {item.openInfo.label}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    📍 詳細位置：{item.service_item || item.extra.locationDesc || "請洽現場服務人員"}
                  </p>

                  <p className="text-xs text-slate-500">
                    {item.address || "未提供詳細地址"}
                    {item.phone && ` ｜ 📞 ${item.phone}`}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {item.distance_km !== undefined && (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {item.distance_km < 1 ? `${Math.round(item.distance_km * 1000)}m` : `${item.distance_km}km`}
                    </span>
                  )}
                  {item.lat && item.lng && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      導航 ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. 急救心法科普區（叫叫CD） */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/60">
        <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
          💡 AED 急救口訣：「叫、叫、C、D」
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow-xs dark:bg-slate-800">
            <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">1. 叫</span>
            <p className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-200">評估意識與呼吸</p>
            <p className="mt-0.5 text-[11px] text-slate-500">拍打患者雙肩並大聲呼喚，檢查胸部有無起伏。</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-xs dark:bg-slate-800">
            <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">2. 叫</span>
            <p className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-200">大聲呼救求援</p>
            <p className="mt-0.5 text-[11px] text-slate-500">指定旁人撥打 119，並請人迅速取得最近的 AED。</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-xs dark:bg-slate-800">
            <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">3. C (CPR)</span>
            <p className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-200">胸外按壓</p>
            <p className="mt-0.5 text-[11px] text-slate-500">雙手重疊用力按壓胸骨下半段，每分鐘 100-120 下、深度 5-6 公分。</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-xs dark:bg-slate-800">
            <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">4. D (Defibrillation)</span>
            <p className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-200">開啟 AED 遵從語音</p>
            <p className="mt-0.5 text-[11px] text-slate-500">貼上電擊貼片，機具分析心律時所有人離患者，依指示按下電擊鈕。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
