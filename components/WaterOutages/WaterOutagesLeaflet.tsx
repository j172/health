"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import type {
  WaterOutageItem,
  EmergencyWaterStation,
} from "@/lib/server/waterOutages/types";
import type { BaseMapMarker } from "@/components/Map/BaseMap";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import PopupNearbyToolsLinks from "@/components/Map/PopupNearbyToolsLinks";

const BaseMap = dynamic(() => import("@/components/Map/BaseMap"), { ssr: false });

const outageIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:24px;height:24px;border-radius:50%;background:#ef4444;border:2.5px solid #fff;box-shadow:0 0 0 2px #ef4444;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;">🚱</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

const waterStationIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:24px;height:24px;border-radius:50%;background:#0284c7;border:2.5px solid #fff;box-shadow:0 0 0 2px #0284c7;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;">🚰</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

export interface WaterOutagesLeafletProps {
  outages: WaterOutageItem[];
  waterStations: EmergencyWaterStation[];
  userLocation?: { lat: number; lng: number };
}

/**
 * 停水資訊＋緊急供水站地圖（issue #476：改用共用 BaseMap，底圖改為國土測繪
 * 中心＋OSM 備援，標記群聚改為共用邏輯）。
 */
export default function WaterOutagesLeaflet({
  outages,
  waterStations,
  userLocation,
}: WaterOutagesLeafletProps) {
  const defaultCenter: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [23.9738, 120.982]; // 臺灣中心位置

  const defaultZoom = userLocation ? 12 : 8;

  const markers: BaseMapMarker[] = useMemo(() => {
    const outageMarkers: BaseMapMarker[] = outages
      .filter((o) => o.lat && o.lng)
      .map((o) => ({
        id: `outage-${o.id}`,
        lat: o.lat!,
        lng: o.lng!,
        label: o.title,
        icon: outageIcon,
        popup: (
          <div className="space-y-1 text-xs">
            <div className="font-bold text-red-600">
              {o.outageType === "emergency" ? "⚠️ 突發破管停水" : "🔧 計畫性更換管線工程"}
            </div>
            <div className="font-semibold text-slate-800">{o.title}</div>
            <div className="text-slate-600">
              時間: {new Date(o.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ~{" "}
              {new Date(o.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="text-slate-600">影響: 約 {o.affectedHouseholds} 戶</div>
            <div className="text-[11px] text-slate-500">來源: {o.source}</div>
            <PopupNearbyToolsLinks lat={o.lat} lng={o.lng} />
          </div>
        ),
      }));

    const waterStationMarkers: BaseMapMarker[] = waterStations
      .filter((s) => s.lat && s.lng)
      .map((s) => ({
        id: `station-${s.stationId}`,
        lat: s.lat,
        lng: s.lng,
        label: s.name,
        sublabel: s.address,
        icon: waterStationIcon,
        popup: (
          <div className="space-y-1.5 text-xs">
            <div className="font-bold text-sky-600">
              🚰 {s.name}
            </div>
            <div className="text-slate-700">📍 {s.address}</div>
            <div className="text-slate-600">🕒 開放時間: {s.operatingHours}</div>
            <div className="text-slate-600">
              型態: {s.waterType === "water_truck" ? "緊急水車" : "固定式儲水桶"}
            </div>
            <div className="pt-1">
              <a
                href={appendOutboundUtm(
                  `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`,
                  { medium: "map_navigation", campaign: "map_directions" },
                )}
                target="_blank"
                rel="noreferrer noopener"
                className="font-bold text-indigo-600 hover:underline"
              >
                開啟 Google 地圖導航 ↗
              </a>
            </div>
            <PopupNearbyToolsLinks lat={s.lat} lng={s.lng} />
          </div>
        ),
      }));

    return [...outageMarkers, ...waterStationMarkers];
  }, [outages, waterStations]);

  return (
    <div className="h-[450px] w-full">
      <BaseMap
        markers={markers}
        center={defaultCenter}
        zoom={defaultZoom}
        userLocation={userLocation ? { lat: userLocation.lat, lng: userLocation.lng, isDefault: false } : undefined}
      />
    </div>
  );
}
