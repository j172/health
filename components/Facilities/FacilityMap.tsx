"use client";

import dynamic from "next/dynamic";
import type { BaseMapMarker } from "@/components/Map/BaseMap";
import PopupNearbyToolsLinks from "@/components/Map/PopupNearbyToolsLinks";
import { appendOutboundUtm } from "@/lib/format/outboundLink";

const BaseMap = dynamic(() => import("@/components/Map/BaseMap"), { ssr: false });

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  address?: string | null;
  phone?: string | null;
  charityUrl?: string | null;
  charityName?: string | null;
}

export interface FacilityMapProps {
  userLocation: {
    lat: number;
    lng: number;
    isDefault: boolean;
    refresh?: () => void;
    refreshing?: boolean;
  };
  markers: MapMarker[];
  showRadius?: boolean;
  radiusMeters?: number;
}

/**
 * 機構地圖（issue #476：改用共用 BaseMap，底圖已改為國土測繪中心＋OSM 備援，
 * 不再是直接寫死的 OSM 單一底圖）。SSR 不安全，BaseMap 內部已用 dynamic 載入。
 *
 * 不把 `userLocation.refresh` 轉接給 BaseMap 的內建定位按鈕——呼叫端（
 * FacilitySearchContent／CareCircleMap／PublicArtContent）都已經有自己的
 * `MapLocationBanner`，裡面同樣有「重新嘗試定位」按鈕，兩個定位按鈕疊在同一
 * 張地圖上只是重複（見 issue #476 的決策）。
 */
export default function FacilityMap({ userLocation, markers, showRadius = true, radiusMeters = 5000 }: FacilityMapProps) {
  const baseMapMarkers: BaseMapMarker[] = markers.map((m) => ({
    id: m.id,
    lat: m.lat,
    lng: m.lng,
    label: m.name,
    sublabel: m.address ?? undefined,
    popup: (
      <div className="text-sm leading-relaxed">
        <p className="font-semibold text-neutral-900">{m.name}</p>
        {m.address && <p className="text-neutral-600">{m.address}</p>}
        {m.phone && (
          <p className="text-blue-600">
            <a href={`tel:${m.phone.replace(/[^0-9]/g, "")}`} className="hover:underline">{m.phone}</a>
          </p>
        )}
        {m.charityUrl && (
          <div className="mt-2 pt-1.5 border-t border-neutral-100">
            <a
              href={appendOutboundUtm(m.charityUrl, {
                medium: "tool_outbound",
                campaign: "facility_search",
                content: "charity_map_popup",
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded bg-rose-500 px-2.5 py-1 text-xs font-semibold !text-white hover:bg-rose-600 transition-colors shadow-sm"
            >
              <span>🛍️</span>
              <span>{m.charityName || "愛心義賣"}</span>
              <span className="text-[10px]">↗</span>
            </a>
          </div>
        )}
        <PopupNearbyToolsLinks lat={m.lat} lng={m.lng} />
      </div>
    ),
  }));

  return (
    <BaseMap
      markers={baseMapMarkers}
      userLocation={{ lat: userLocation.lat, lng: userLocation.lng, isDefault: userLocation.isDefault }}
      circle={
        showRadius
          ? { center: [userLocation.lat, userLocation.lng], radiusMeters, pathOptions: { color: "#625df5", fillColor: "#625df5", fillOpacity: 0.07 } }
          : undefined
      }
    />
  );
}
