"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { BaseMapMarker } from "@/components/Map/BaseMap";
import type { CpcStationItem } from "@/lib/server/cpc/stations";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import PopupNearbyToolsLinks from "@/components/Map/PopupNearbyToolsLinks";

const BaseMap = dynamic(() => import("@/components/Map/BaseMap"), { ssr: false });

const FUEL_TYPE_LABELS: Record<string, string> = {
  unleaded92: "無鉛92",
  unleaded95: "無鉛95",
  unleaded98: "無鉛98",
  alcoholGasoline: "酒精汽油",
  kerosene: "煤油",
  superDiesel: "超柴",
};

export interface CpcStationMapProps {
  stations: CpcStationItem[];
  userLocation: { lat: number; lng: number; isDefault: boolean };
  selectedStationId?: number | null;
  onSelectStation?: (station: CpcStationItem) => void;
}

/**
 * 中油站點地圖（issue #476：改用共用 BaseMap，底圖改為國土測繪中心＋OSM 備援，
 * 群聚與清單／地圖切換改為共用邏輯）。
 *
 * - `showViewToggle={false}`：`CpcStationsClient.tsx` 下方已經有自己完整的
 *   站點清單卡片（含分頁、服務篩選），BaseMap 內建的簡易清單檢視只會是重複、
 *   功能更少的第二份清單。
 * - 不把定位按鈕轉接給 BaseMap——`CpcStationsClient.tsx` 已經有頁面上方的
 *   「📍 定位附近加油站」按鈕與 `MapLocationBanner`，原本地圖右上角另一個
 *   「我的位置」懸浮按鈕（`onRecenter`）只是重複，直接移除（見 issue #476 的決策）。
 * - `focusMarkerId`／`onMarkerClick` 取代原本「`selectedStationId` 變動
 *   → `MapContainer center` 跟著變 → `MapViewController` flyTo」的寫法：點擊地圖
 *   上的站點圖標或外部清單卡片的「地圖定位此站」按鈕，地圖都會平移過去，縮放
 *   層級不變，跟改版前的行為一致。
 */
export default function CpcStationMap({
  stations,
  userLocation,
  selectedStationId,
  onSelectStation,
}: CpcStationMapProps) {
  const markers: BaseMapMarker[] = useMemo(
    () =>
      stations
        .filter((station) => station.lat && station.lng)
        .map((station) => ({
          id: String(station.id),
          lat: station.lat!,
          lng: station.lng!,
          label: station.name,
          sublabel: station.address ?? undefined,
          popup: (
            <div className="max-w-[260px] text-xs leading-relaxed space-y-1.5 p-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-blue-800 dark:text-blue-600">
                  {station.name}
                </span>
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-mono text-blue-800">
                  {station.extra_json?.stationCode}
                </span>
              </div>

              {station.address && (
                <div className="text-slate-600">
                  📍 {station.address}
                </div>
              )}

              {station.phone && (
                <div className="text-slate-600">
                  📞 <a href={`tel:${station.phone}`} className="text-blue-600 hover:underline">{station.phone}</a>
                </div>
              )}

              {station.distance_km !== undefined && (
                <div className="text-[11px] font-semibold text-emerald-600">
                  距離約 {station.distance_km.toFixed(1)} 公里
                </div>
              )}

              {station.extra_json?.businessHours && (
                <div className="text-slate-600">
                  🕐 總營業時間：{station.extra_json.businessHours}
                </div>
              )}

              {station.extra_json?.fuelTypes && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(station.extra_json.fuelTypes)
                    .filter(([, v]) => v)
                    .map(([k]) => (
                      <span
                        key={k}
                        className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                      >
                        {FUEL_TYPE_LABELS[k] || k}
                      </span>
                    ))}
                </div>
              )}

              {/* Services tags */}
              {station.extra_json?.services && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {station.extra_json.services.map((svc) => (
                    <span
                      key={svc}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                    >
                      {svc}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-2 pt-1 border-t border-slate-100 flex justify-between items-center">
                <a
                  href={appendOutboundUtm(
                    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      station.address || `${station.lat},${station.lng}`,
                    )}`,
                    { medium: "map_navigation", campaign: "map_directions" },
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline"
                >
                  開啟 Google 導航 ↗
                </a>
              </div>
              <PopupNearbyToolsLinks lat={station.lat} lng={station.lng} />
            </div>
          ),
        })),
    [stations],
  );

  return (
    <div className="relative h-[480px] w-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800">
      <BaseMap
        markers={markers}
        zoom={13}
        userLocation={{ lat: userLocation.lat, lng: userLocation.lng, isDefault: userLocation.isDefault }}
        showViewToggle={false}
        focusMarkerId={selectedStationId != null ? String(selectedStationId) : null}
        onMarkerClick={(id) => {
          const station = stations.find((s) => String(s.id) === id);
          if (station) onSelectStation?.(station);
        }}
      />
    </div>
  );
}
