"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import type { BaseMapMarker } from "@/components/Map/BaseMap";
import { GEO_DEFAULTS } from "@/lib/constants/geoDefaults";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import PopupNearbyToolsLinks from "@/components/Map/PopupNearbyToolsLinks";

const BaseMap = dynamic(() => import("@/components/Map/BaseMap"), { ssr: false });

const statutoryIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#f59e0b;border:2px solid #fff;box-shadow:0 0 0 1.5px #f59e0b;display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;">🏛️</div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
});

const voluntaryIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#ec4899;border:2px solid #fff;box-shadow:0 0 0 1.5px #ec4899;display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;">🍼</div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
});

export interface BreastfeedingRoomPoint {
  id: number;
  name: string;
  county: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  settingType?: "statutory" | "voluntary";
  settingTypeLabel?: string;
  source?: string;
}

export interface BreastfeedingMapProps {
  points: BreastfeedingRoomPoint[];
  userLocation?: { lat: number; lng: number; isDefault: boolean };
  center?: [number, number];
  zoom?: number;
}

/**
 * 哺集乳室地圖（issue #476：改用共用 BaseMap，底圖改為國土測繪中心＋OSM 備援，
 * 標記群聚改為共用邏輯）。
 *
 * `showViewToggle={false}`：`BreastfeedingMapContent.tsx` 的頁面層級已經有自己
 * 的「地圖／清單」切換按鈕，BaseMap 內建的切換只會是地圖角落多出來的第二個
 * 重複控制（見 issue #476 的決策）。
 */
export default function BreastfeedingMapLeaflet({
  points,
  userLocation,
  center,
  zoom = 13,
}: BreastfeedingMapProps) {
  const mapCenter: [number, number] = center ?? [userLocation?.lat ?? GEO_DEFAULTS.lat, userLocation?.lng ?? GEO_DEFAULTS.lng];

  const markers: BaseMapMarker[] = useMemo(
    () =>
      points.map((p) => {
        const isStatutory = p.settingType === "statutory";
        const badgeColor = isStatutory ? "text-amber-700 bg-amber-50" : "text-pink-600 bg-pink-50";

        return {
          id: String(p.id),
          lat: p.lat,
          lng: p.lng,
          label: p.name,
          sublabel: p.address,
          icon: isStatutory ? statutoryIcon : voluntaryIcon,
          popup: (
            <div className="text-sm leading-relaxed">
              <div className="flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${badgeColor}`}>
                  {isStatutory ? "🏛️ 依法設置" : "🍼 自願設置"}
                </span>
                <span className="text-xs text-neutral-500">{p.county}</span>
              </div>
              <p className="mt-1 font-semibold text-neutral-900">{p.name}</p>
              {p.address && <p className="text-xs text-neutral-600">{p.address}</p>}
              {p.phone && (
                <p className="mt-1 text-xs text-neutral-500">
                  📞 <a href={`tel:${p.phone.replace(/[^0-9]/g, "")}`} className="hover:underline">{p.phone}</a>
                </p>
              )}
              <div className="mt-1.5 border-t border-neutral-100 pt-1">
                <a
                  href={appendOutboundUtm(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${p.name} ${p.address}`,
                    )}`,
                    { medium: "map_navigation", campaign: "map_search" },
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-pink-600 hover:underline"
                >
                  Google 地圖導航 ↗
                </a>
              </div>
              <PopupNearbyToolsLinks lat={p.lat} lng={p.lng} />
            </div>
          ),
        };
      }),
    [points],
  );

  return (
    <BaseMap
      markers={markers}
      center={mapCenter}
      zoom={zoom}
      userLocation={userLocation}
      showViewToggle={false}
    />
  );
}
