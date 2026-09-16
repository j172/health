"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import type { DisasterLayer } from "@/lib/server/disaster/ingestDisasterPoints";
import type { DisasterPoint } from "@/lib/server/disaster/queries";

import { useGeolocation } from "@/components/Facilities/useGeolocation";
import MapLocationBanner from "@/components/Common/MapLocationBanner";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import type { InundationPoint } from "@/lib/server/wra/inundation";
import type { DamStructureMapPoint } from "@/lib/server/wra/damStructureQueries";
import type { GroundwaterMapPoint } from "@/lib/server/wra/groundwaterQueries";
import type { InundationRegion } from "@/lib/server/wra/fetchInundationRegions";

const DisasterMapLeaflet = dynamic(() => import("@/components/DisasterMap/DisasterMapLeaflet"), { ssr: false });

interface LayerConfig {
  layer: DisasterLayer;
  label: string;
  emoji: string;
  color: string;
  defaultOn: boolean;
}

const LAYERS: LayerConfig[] = [
  { layer: "shelter", label: "避難收容處所", emoji: "🏫", color: "#16a34a", defaultOn: true },
  { layer: "rescue_unit", label: "消防救援單位", emoji: "🚒", color: "#dc2626", defaultOn: true },
  { layer: "eoc_center", label: "應變中心", emoji: "🏢", color: "#2563eb", defaultOn: false },
];

const COUNTY_COORDS: Record<string, [number, number]> = {
  "臺北市": [25.0375, 121.5637],
  "新北市": [25.0125, 121.4658],
  "基隆市": [25.1322, 121.7444],
  "桃園市": [24.9936, 121.3010],
  "新竹市": [24.8039, 120.9647],
  "新竹縣": [24.8387, 121.0177],
  "苗栗縣": [24.5601, 120.8214],
  "臺中市": [24.1627, 120.6473],
  "彰化縣": [24.0816, 120.5385],
  "南投縣": [23.9100, 120.6860],
  "雲林縣": [23.7093, 120.4313],
  "嘉義市": [23.4800, 120.4491],
  "嘉義縣": [23.4518, 120.2555],
  "臺南市": [22.9997, 120.2270],
  "高雄市": [22.6273, 120.3014],
  "屏東縣": [22.6826, 120.4879],
  "宜蘭縣": [24.7570, 121.7530],
  "花蓮縣": [23.9912, 121.6196],
  "臺東縣": [22.7583, 121.1444],
  "澎湖縣": [23.5658, 119.5793],
  "金門縣": [24.4327, 118.3226],
  "連江縣": [26.1558, 119.9519],
};

function haversineDistKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const formatUpdatedAt = (iso: string | null): string => {
  if (!iso) return "尚無同步紀錄";
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export default function DisasterMapContent() {
  const location = useGeolocation();
  const [points, setPoints] = useState<DisasterPoint[]>([]);
  const [inundationPoints, setInundationPoints] = useState<InundationPoint[]>([]);
  const [showInundation, setShowInundation] = useState(true);
  const [damStructurePoints, setDamStructurePoints] = useState<DamStructureMapPoint[]>([]);
  const [groundwaterPoints, setGroundwaterPoints] = useState<GroundwaterMapPoint[]>([]);
  const [inundationRegions, setInundationRegions] = useState<InundationRegion[]>([]);
  const [showDamStructure, setShowDamStructure] = useState(false);
  const [showGroundwater, setShowGroundwater] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [selectedCounty, setSelectedCounty] = useState<string>("all");
  const [customCenter, setCustomCenter] = useState<[number, number] | undefined>(undefined);

  const [visibleLayers, setVisibleLayers] = useState<Record<DisasterLayer, boolean>>(() =>
    Object.fromEntries(LAYERS.map((l) => [l.layer, l.defaultOn])) as Record<DisasterLayer, boolean>,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [disasterRes, inundationRes, wraIotRes] = await Promise.allSettled([
          fetchWithTimeout("/api/disaster-map", { timeoutMs: 5000 }).then((r) => r.json()),
          fetchWithTimeout("/api/disaster/inundation", { timeoutMs: 5000 }).then((r) => r.json()),
          fetchWithTimeout("/api/disaster/wra-iot", { timeoutMs: 5000 }).then((r) => r.json()),
        ]);

        if (cancelled) return;

        if (disasterRes.status === "fulfilled" && disasterRes.value.ok && Array.isArray(disasterRes.value.points)) {
          setPoints(disasterRes.value.points);
          setUpdatedAt(disasterRes.value.updatedAt ?? null);
        } else {
          // 備援機制：如果後端暫時超時或無資料，嘗試從靜態 fallback 讀取
          console.warn("Disaster API failed or empty, loading local seed fallback...");
          const resFallback = await fetchWithTimeout("/api/facilities?type=disaster_shelter&limit=200", { timeoutMs: 5000 });
          if (resFallback.ok) {
            const data = await resFallback.json();
            if (Array.isArray(data.facilities) && data.facilities.length > 0) {
              const mapped: DisasterPoint[] = data.facilities.map((f: any) => ({
                id: f.id,
                layer: "shelter",
                name: f.name,
                county: f.extra_json?.county || "新北市",
                district: f.extra_json?.district || null,
                village: f.extra_json?.village || null,
                address: f.address,
                phone: f.phone,
                lng: Number(f.lng),
                lat: Number(f.lat),
                capacity: f.extra_json?.capacity || 100,
                disasterTypes: "水災,震災",
                indoor: true,
                outdoor: false,
                weakSuitable: true,
                managerName: f.extra_json?.contact_person || null,
                managerPhone: f.phone,
              }));
              setPoints(mapped);
              setUpdatedAt(new Date().toISOString());
            }
          }
        }

        if (inundationRes.status === "fulfilled" && inundationRes.value.ok) {
          setInundationPoints(inundationRes.value.points ?? []);
        }

        if (wraIotRes.status === "fulfilled" && wraIotRes.value.ok) {
          setDamStructurePoints(wraIotRes.value.damStructurePoints ?? []);
          setGroundwaterPoints(wraIotRes.value.groundwaterPoints ?? []);
          setInundationRegions(wraIotRes.value.inundationRegions ?? []);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "資料載入失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const countsByLayer = useMemo(() => {
    const counts: Record<DisasterLayer, number> = { shelter: 0, rescue_unit: 0, eoc_center: 0 };
    for (const p of points) counts[p.layer] = (counts[p.layer] || 0) + 1;
    return counts;
  }, [points]);

  // 依照圖層勾選、縣市、關鍵字過濾
  const filteredPoints = useMemo(() => {
    let list = points.filter((p) => visibleLayers[p.layer]);

    if (selectedCounty !== "all") {
      list = list.filter((p) => p.county && p.county.replace(/台/g, "臺").includes(selectedCounty.replace(/台/g, "臺")));
    }

    if (keyword.trim()) {
      const kw = keyword.toLowerCase().trim().replace(/台/g, "臺");
      list = list.filter((p) => {
        const name = (p.name || "").toLowerCase().replace(/台/g, "臺");
        const addr = (p.address || "").toLowerCase().replace(/台/g, "臺");
        const dist = (p.district || "").toLowerCase().replace(/台/g, "臺");
        return name.includes(kw) || addr.includes(kw) || dist.includes(kw);
      });
    }

    return list;
  }, [points, visibleLayers, selectedCounty, keyword]);

  // 計算離使用者最近的 4 處避難所或消防單位
  const closestShelters = useMemo(() => {
    if (!location.lat || !location.lng) return [];
    const uLat = location.lat;
    const uLng = location.lng;

    return points
      .filter((p) => (p.layer === "shelter" || p.layer === "rescue_unit") && p.lat && p.lng)
      .map((p) => ({
        ...p,
        distKm: haversineDistKm(uLat, uLng, p.lat, p.lng),
      }))
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 4);
  }, [points, location.lat, location.lng]);

  const toggleLayer = (layer: DisasterLayer) =>
    setVisibleLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));

  const handleCountyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const c = e.target.value;
    setSelectedCounty(c);
    if (c !== "all" && COUNTY_COORDS[c]) {
      setCustomCenter(COUNTY_COORDS[c]);
    } else {
      setCustomCenter(undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-extrabold text-neutral-900 dark:text-slate-100 md:text-4xl tracking-tight">
          🆘 防災地圖
        </h1>
        <p className="text-neutral-600 dark:text-slate-300 text-sm leading-relaxed">
          整合內政部開放資料（全台 5,900+ 處避難收容處所、消防救援單位、縣市應變中心）與經濟部水利署即時水資源物聯網（淹水感測、堤防安全、地下水位），支援 GPS 即時定位與圖層切換查詢。
        </p>
      </div>

      {/* 定位授權與狀態指引橫幅 */}
      <MapLocationBanner location={location} facilityTypeName="避難收容處所與救援單位" />

      {/* 資料更新時間與免責聲明 */}
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <p className="font-semibold">
          資料更新時間：{loading ? "載入中…" : formatUpdatedAt(updatedAt)}
        </p>
        <p className="mt-1">
          本頁避難設施資料每日定時同步；天災發生時之實際開設狀態，請務必以地方政府（消防局／區公所／災害應變中心）即時公告為準。
        </p>
      </div>

      {/* 導流至全台積淹水即時感測地圖 */}
      <div className="rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 dark:from-slate-800 dark:to-blue-950/40 p-4 border border-sky-100 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🌊</span>
          <div>
            <div className="text-xs font-bold text-sky-950 dark:text-sky-300">需要查詢地下道與道路積水即時深度？</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">水利署 IoT 即時路面感測地圖已上線，提供全台易積水路口公分級水深與防汛警戒</div>
          </div>
        </div>
        <Link
          href="/tools/inundation-map"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold whitespace-nowrap transition shadow-sm"
        >
          <span>查看淹水感測地圖</span>
          <span>→</span>
        </Link>
      </div>

      {/* 搜尋、縣市快選與圖層切換列 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-48">
            <select
              value={selectedCounty}
              onChange={handleCountyChange}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">📍 全部縣市 ({points.length} 處)</option>
              {Object.keys(COUNTY_COORDS).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="relative flex-1">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋避難所名稱、地址（如：國小、活動中心、消防分隊）"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        {/* 圖層勾選框 */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          {LAYERS.map((l) => (
            <label
              key={l.layer}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <input
                type="checkbox"
                checked={visibleLayers[l.layer]}
                onChange={() => toggleLayer(l.layer)}
                className="h-3.5 w-3.5 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span aria-hidden="true">{l.emoji}</span>
              <span>{l.label}</span>
              <span
                className="rounded-full px-1.5 py-0.2 text-[10px] font-semibold text-white"
                style={{ backgroundColor: l.color }}
              >
                {countsByLayer[l.layer] || 0}
              </span>
            </label>
          ))}

          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50/50 px-2.5 py-1.5 text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100/60 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-200">
            <input
              type="checkbox"
              checked={showInundation}
              onChange={() => setShowInundation(!showInundation)}
              className="h-3.5 w-3.5 rounded border-sky-300 text-sky-600 focus:ring-sky-500"
            />
            <span aria-hidden="true">🌊</span>
            <span>即時路面積水</span>
            <span className="rounded-full bg-sky-600 px-1.5 py-0.2 text-[10px] font-semibold text-white">
              {inundationPoints.length}
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100/60 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
            <input
              type="checkbox"
              checked={showDamStructure}
              onChange={() => setShowDamStructure(!showDamStructure)}
              className="h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <span aria-hidden="true">🧱</span>
            <span>堤防結構監測</span>
            <span className="rounded-full bg-amber-600 px-1.5 py-0.2 text-[10px] font-semibold text-white">
              {damStructurePoints.length}
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50/50 px-2.5 py-1.5 text-xs font-medium text-teal-800 transition-colors hover:bg-teal-100/60 dark:border-teal-800/60 dark:bg-teal-950/30 dark:text-teal-200">
            <input
              type="checkbox"
              checked={showGroundwater}
              onChange={() => setShowGroundwater(!showGroundwater)}
              className="h-3.5 w-3.5 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
            />
            <span aria-hidden="true">💧</span>
            <span>地下水位</span>
            <span className="rounded-full bg-teal-600 px-1.5 py-0.2 text-[10px] font-semibold text-white">
              {groundwaterPoints.length}
            </span>
          </label>
        </div>
      </div>

      {/* 地圖呈現 */}
      <div className="h-[60vh] min-h-[440px] w-full overflow-hidden rounded-2xl border border-neutral-200 dark:border-slate-800 shadow-sm">
        {loading ? (
          <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-900">
            <LoadingOrb />
          </div>
        ) : (
          <DisasterMapLeaflet
            points={filteredPoints}
            inundationPoints={showInundation ? inundationPoints : []}
            damStructurePoints={showDamStructure ? damStructurePoints : []}
            groundwaterPoints={showGroundwater ? groundwaterPoints : []}
            userLocation={location}
            center={customCenter}
          />
        )}
      </div>

      {/* 距離您最近的避難收容處所與救援單位快速卡片 */}
      {closestShelters.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-slate-100">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-xs text-white">
                🏫
              </span>
              距離您最近的避難處所與救援單位
              <span className="text-xs font-normal text-slate-500">（依 GPS 距離排列）</span>
            </h3>
            <span className="text-xs text-slate-500">
              共顯示離您最近的 {closestShelters.length} 處
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {closestShelters.map((item) => {
              const isShelter = item.layer === "shelter";
              return (
                <div
                  key={`${item.layer}-${item.id}`}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-indigo-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${
                          isShelter ? "bg-emerald-600" : "bg-rose-600"
                        }`}
                      >
                        {isShelter ? "🏫 避難處所" : "🚒 消防隊"}
                      </span>
                      {item.distKm !== undefined && (
                        <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                          {item.distKm < 1
                            ? `${Math.round(item.distKm * 1000)} 公尺`
                            : `${item.distKm.toFixed(1)} 公里`}
                        </span>
                      )}
                    </div>

                    <h4 className="mt-2 text-sm font-bold text-slate-900 line-clamp-1 dark:text-slate-100">
                      {item.name}
                    </h4>

                    {item.address && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                        📍 {item.address}
                      </p>
                    )}

                    {isShelter && item.capacity !== null && (
                      <p className="mt-1 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        👥 預估容納：約 {item.capacity} 人
                        {item.weakSuitable && " ｜ 適合避難弱者"}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2 dark:border-slate-800">
                    {item.lat && item.lng && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700"
                      >
                        🗺️ 路線
                      </a>
                    )}
                    {item.phone && (
                      <a
                        href={`tel:${item.phone.replace(/[^0-9]/g, "")}`}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        📞 撥號
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
