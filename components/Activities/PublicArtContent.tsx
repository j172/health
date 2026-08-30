"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import type { PublicArtItem } from "@/app/api/culture/public-art/route";

const FacilityMap = dynamic(() => import("@/components/Facilities/FacilityMap"), { ssr: false });

const TAIWAN_CITIES = [
  "全部縣市",
  "臺北市",
  "新北市",
  "基隆市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "臺中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "臺南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "臺東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
];

const FIELD_TYPES = ["全部場域", "交通建設", "教育機構", "休閒運動", "政府機關", "醫療院所", "其他場域"];

export default function PublicArtContent() {
  const [items, setItems] = useState<PublicArtItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [keyword, setKeyword] = useState("");
  const [selectedCity, setSelectedCity] = useState("全部縣市");
  const [selectedField, setSelectedField] = useState("全部場域");
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");

  const [userGps, setUserGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const loadData = useCallback(async (lat?: number, lng?: number) => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/culture/public-art";
      const params = new URLSearchParams();
      if (lat && lng) {
        params.set("lat", String(lat));
        params.set("lng", String(lng));
        params.set("radius", "50");
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "載入公共藝術資料失敗");
      setItems(json.items || []);
    } catch (err: any) {
      setError(err.message || "無法連線至文化部公共藝術資料庫");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      alert("您的瀏覽器不支援定位功能。");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserGps(coords);
        setGpsLoading(false);
        loadData(coords.lat, coords.lng);
      },
      (err) => {
        setGpsLoading(false);
        alert(`無法取得位置：${err.message}`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Keyword
      if (keyword.trim()) {
        const kw = keyword.toLowerCase().trim();
        const matchTitle = item.title.toLowerCase().includes(kw);
        const matchArtist = item.artist.toLowerCase().includes(kw);
        const matchLoc = item.location.toLowerCase().includes(kw);
        const matchDesc = item.description?.toLowerCase().includes(kw) ?? false;
        const matchAgency = item.agency?.toLowerCase().includes(kw) ?? false;
        if (!matchTitle && !matchArtist && !matchLoc && !matchDesc && !matchAgency) return false;
      }

      // City filter
      if (selectedCity !== "全部縣市") {
        if (!item.city.includes(selectedCity) && !item.location.includes(selectedCity)) {
          return false;
        }
      }

      // Field type filter
      if (selectedField !== "全部場域") {
        if (selectedField === "其他場域") {
          if (["交通建設", "教育機構", "休閒運動", "政府機關", "醫療院所"].includes(item.fieldType || "")) {
            return false;
          }
        } else {
          if (item.fieldType !== selectedField) return false;
        }
      }

      return true;
    });
  }, [items, keyword, selectedCity, selectedField]);

  const mapMarkers = useMemo(() => {
    return filteredItems
      .filter((i) => i.lat !== null && i.lng !== null)
      .slice(0, 100)
      .map((i) => ({
        id: i.id,
        lat: i.lat!,
        lng: i.lng!,
        name: i.title,
        address: `${i.artist}｜${i.location}`,
      }));
  }, [filteredItems]);

  return (
    <div className="space-y-6">
      {/* Header Search & Filters Panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Keyword Search */}
            <div className="relative flex-1">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋公共藝術作品名稱、創作者、設置地點、機關..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder-slate-500"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  清除
                </button>
              )}
            </div>

            {/* GPS Nearby Button */}
            <button
              type="button"
              onClick={handleUseGps}
              disabled={gpsLoading}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-bold transition-all ${
                userGps
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              <span>{gpsLoading ? "📍 定位中..." : userGps ? "📍 附近 50km" : "🧭 尋找附近作品"}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            {/* City Filter */}
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              aria-label="選擇作品縣市"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {TAIWAN_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Field Type Filter */}
            <select
              value={selectedField}
              onChange={(e) => setSelectedField(e.target.value)}
              aria-label="選擇作品場域"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {FIELD_TYPES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <div className="ml-auto flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/70 p-1 dark:border-slate-800 dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === "grid"
                    ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-700 dark:text-indigo-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                📋 圖文清單
              </button>
              <button
                type="button"
                onClick={() => setViewMode("map")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === "map"
                    ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-700 dark:text-indigo-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                🗺️ 地圖模式
              </button>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            目前收錄 <strong className="font-semibold text-indigo-600 dark:text-indigo-400">{filteredItems.length}</strong> 件全台公共藝術作品
          </span>
          <span>資料來源：文化部公共藝術資料庫開放資料</span>
        </div>
      </div>

      {/* Map View */}
      {viewMode === "map" && !loading && (
        <div className="h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <FacilityMap
            userLocation={{
              lat: userGps?.lat ?? 25.0478,
              lng: userGps?.lng ?? 121.517,
              isDefault: !userGps,
            }}
            markers={mapMarkers}
            showRadius={Boolean(userGps)}
            radiusMeters={50000}
          />
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="h-5 w-3/4 rounded-md bg-slate-200 dark:bg-slate-800" />
              <div className="mt-3 h-4 w-1/2 rounded-md bg-slate-200 dark:bg-slate-800" />
              <div className="mt-4 h-24 w-full rounded-xl bg-slate-100 dark:bg-slate-800/60" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
          <p className="text-sm font-medium text-rose-800 dark:text-rose-300">{error}</p>
          <button
            onClick={() => loadData()}
            className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-500"
          >
            重新載入
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredItems.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <span className="text-4xl">🗿</span>
          <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">查無符合條件的公共藝術作品</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">可嘗試切換縣市、場域或清除關鍵字搜尋。</p>
        </div>
      )}

      {/* Artworks Grid */}
      {viewMode === "grid" && !loading && !error && filteredItems.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2">
          {filteredItems.map((item) => {
            return (
              <div
                key={item.id}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-all hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700/60"
              >
                <div>
                  {/* Artwork Image if available */}
                  {item.imageUrl && (
                    <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                      <Image
                        src={item.imageUrl}
                        alt={item.title}
                        fill
                        unoptimized
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  )}

                  <div className="p-5">
                    {/* Badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                        🎨 {item.artist}
                      </span>
                      {item.fieldType && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {item.fieldType}
                        </span>
                      )}
                      {item.year && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {item.year} 年
                        </span>
                      )}
                      {item.distanceKm !== undefined && (
                        <span className="ml-auto rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          距您 {item.distanceKm} km
                        </span>
                      )}
                    </div>

                    {/* Artwork Title */}
                    <h3 className="mt-2.5 text-base font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                      {item.title}
                    </h3>

                    {/* Setting location */}
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <span className="shrink-0 text-slate-400">📍</span>
                      <span className="font-medium">{item.location}</span>
                    </div>

                    {/* Material & Dimensions */}
                    {(item.material || item.dimensions) && (
                      <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                        {item.material && <span>材質：{item.material} </span>}
                        {item.dimensions && <span>({item.dimensions})</span>}
                      </div>
                    )}

                    {/* Description preview */}
                    {item.description && (
                      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer action buttons */}
                <div className="flex items-center gap-2 border-t border-slate-100 p-4 pt-3 dark:border-slate-800">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${item.city} ${item.location}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750"
                  >
                    🗺️ Google 地圖導航
                  </a>

                  {item.sourceUrl && (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-center text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-500"
                    >
                      🏛️ 文化部典藏頁 ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

