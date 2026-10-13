"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import type { BaseMapMarker } from "@/components/Map/BaseMap";
import { GEO_DEFAULTS } from "@/lib/constants/geoDefaults";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import PopupNearbyToolsLinks from "@/components/Map/PopupNearbyToolsLinks";

const BaseMap = dynamic(() => import("@/components/Map/BaseMap"), { ssr: false });

const clinicIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#0284c7;border:2px solid #fff;box-shadow:0 0 0 1.5px #0284c7;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;">🏥</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -11],
});

const pharmacyIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#059669;border:2px solid #fff;box-shadow:0 0 0 1.5px #059669;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;">💊</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -11],
});

export interface ContraceptionPoint {
  id: number;
  originalId?: string;
  name: string;
  category: "clinic" | "pharmacy";
  categoryLabel: string;
  city: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  source?: string;
}

export interface ContraceptionMapProps {
  points: ContraceptionPoint[];
  userLocation?: { lat: number; lng: number; isDefault: boolean };
  center?: [number, number];
  zoom?: number;
}

/**
 * 事後避孕藥友善診所／藥局地圖（issue #476：改用共用 BaseMap，底圖改為國土
 * 測繪中心＋OSM 備援，標記群聚改為共用邏輯）。
 *
 * `showViewToggle={false}`：`ContraceptionMapContent.tsx` 的頁面層級已經有自己
 * 的「地圖／清單」切換按鈕，BaseMap 內建的切換只會是地圖角落多出來的第二個
 * 重複控制（見 issue #476 的決策）。
 */
export default function ContraceptionMapLeaflet({
  points,
  userLocation,
  center,
  zoom = 13,
}: ContraceptionMapProps) {
  const mapCenter: [number, number] = center ?? [userLocation?.lat ?? GEO_DEFAULTS.lat, userLocation?.lng ?? GEO_DEFAULTS.lng];

  const markers: BaseMapMarker[] = useMemo(
    () =>
      points.map((p) => {
        const isClinic = p.category === "clinic";
        const badgeClass = isClinic
          ? "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";

        return {
          id: `${p.category}-${p.id}`,
          lat: p.lat,
          lng: p.lng,
          label: p.name,
          sublabel: p.address,
          icon: isClinic ? clinicIcon : pharmacyIcon,
          popup: (
            <div className="text-sm leading-relaxed">
              <div className="flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
                  {isClinic ? "🏥 婦產科診所" : "💊 諮詢藥局"}
                </span>
                <span className="text-xs text-neutral-500">{p.city}</span>
              </div>
              <p className="mt-1 font-semibold text-neutral-900">{p.name}</p>
              {p.address && <p className="text-xs text-neutral-600">{p.address}</p>}
              {p.phone && (
                <p className="mt-1 text-xs text-neutral-500">
                  📞 <a href={`tel:${p.phone.replace(/[^0-9]/g, "")}`} className="hover:underline">{p.phone}</a>
                </p>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-1.5 text-xs">
                <span className="text-[10px] text-neutral-400">BeOK 認證</span>
                <a
                  href={appendOutboundUtm(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${p.name} ${p.address}`,
                    )}`,
                    { medium: "map_navigation", campaign: "map_search" },
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-indigo-600 hover:underline"
                >
                  Google 導航 ↗
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
