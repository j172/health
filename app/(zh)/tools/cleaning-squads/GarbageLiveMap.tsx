"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import type { BaseMapMarker } from "@/components/Map/BaseMap";
import { formatTaipeiDateTime, formatTruckAge, type LiveTruck } from "@/lib/tools/garbageTrucks/live";

const BaseMap = dynamic(() => import("@/components/Map/BaseMap"), { ssr: false });

/** Wide view of 新北市 (板橋) if the map is ever mounted with no trucks; the live tab only mounts it for a city that has some, and then centres on them. */
const FALLBACK_CENTER: [number, number] = [25.012, 121.465];
const INITIAL_ZOOM = 11;

const makeIcon = (stale: boolean) =>
  new L.DivIcon({
    className: "",
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${stale ? "#94a3b8" : "#16a34a"};border:2px solid #fff;box-shadow:0 0 0 1.5px ${stale ? "#94a3b8" : "#16a34a"};display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;opacity:${stale ? 0.65 : 1};">🚛</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });

const FRESH_ICON = makeIcon(false);
const STALE_ICON = makeIcon(true);

/**
 * Map layer of the live truck positions (issue #679 / B-17). Fresh reports are
 * green; reports past the city's fresh window (`truck.stale`) are drawn grey and
 * translucent and say so in their popup — the server has already dropped
 * anything past the city's hide threshold. Built on the shared BaseMap
 * (底圖、備援底圖、清單／地圖切換).
 */
export default function GarbageLiveMap({ trucks }: { trucks: LiveTruck[] }) {
  const markers: BaseMapMarker[] = useMemo(
    () =>
      trucks.map((truck) => ({
        id: truck.car,
        lat: truck.lat,
        lng: truck.lng,
        icon: truck.stale ? STALE_ICON : FRESH_ICON,
        label: `${truck.car}${truck.district ? `・${truck.district}` : ""}`,
        sublabel: `${truck.location ?? "回報位置未載明地址"}（${formatTaipeiDateTime(truck.recordedAt).slice(11)}，${formatTruckAge(truck.ageSeconds)}${truck.stale ? "，資料較舊" : ""}）`,
        popup: (
          <div className="max-w-[260px] space-y-1 p-1 text-xs leading-relaxed">
            <div className="font-bold text-slate-800">
              🚛 {truck.car}（路線 {truck.lineId}）
            </div>
            {truck.location && <div>最後回報位置：{truck.location}</div>}
            <div>
              回報時間：{formatTaipeiDateTime(truck.recordedAt)}（{formatTruckAge(truck.ageSeconds)}）
            </div>
            {truck.stale && <div className="font-semibold text-amber-700">資料較舊：車輛可能已移動或停止回報。</div>}
          </div>
        ),
      })),
    [trucks],
  );

  // Where to look first: the middle of the reporting trucks (the map keeps the visitor's own view afterwards).
  const center = useMemo<[number, number]>(() => {
    if (trucks.length === 0) return FALLBACK_CENTER;
    const lat = trucks.reduce((sum, truck) => sum + truck.lat, 0) / trucks.length;
    const lng = trucks.reduce((sum, truck) => sum + truck.lng, 0) / trucks.length;
    return [lat, lng];
  }, [trucks]);

  return (
    <div className="h-[420px] overflow-hidden rounded-2xl border border-neutral-200 dark:border-slate-800">
      <BaseMap
        markers={markers}
        center={center}
        zoom={INITIAL_ZOOM}
        scrollWheelZoom={false}
        emptyListMessage="目前沒有回報位置的垃圾車"
      />
    </div>
  );
}
