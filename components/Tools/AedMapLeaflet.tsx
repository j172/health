"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import type { FacilityListItem } from "@/lib/server/facilities/queries";
import type { BaseMapMarker } from "@/components/Map/BaseMap";
import type { MapUserLocation } from "@/lib/types/mapUserLocation";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import PopupNearbyToolsLinks from "@/components/Map/PopupNearbyToolsLinks";

const BaseMap = dynamic(() => import("@/components/Map/BaseMap"), { ssr: false });

const createAedIcon = (isOpen24h: boolean) => {
  const bg = isOpen24h ? "#059669" : "#4f46e5"; // green for 24h, indigo for others
  return new L.DivIcon({
    className: "",
    html: `
      <div style="
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: ${bg};
        border: 2.5px solid #ffffff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 14px;
        font-weight: 900;
      ">
        ⚡
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
};

const aed24hIcon = createAedIcon(true);
const aedNormalIcon = createAedIcon(false);

export interface AedMapLeafletProps {
  facilities: FacilityListItem[];
  userLocation: MapUserLocation;
  radiusMeters?: number;
  selectedAedId?: number | null;
  onSelectAed?: (id: number) => void;
}

/**
 * AED 地圖（issue #476：改用共用 BaseMap，底圖改為國土測繪中心＋OSM 備援）。
 *
 * 不把 `userLocation.refresh` 轉接給 BaseMap 的內建定位按鈕——`AedContent.tsx`
 * 已經有自己的 `MapLocationBanner`，重複一個定位按鈕只是疊加在地圖右上角的噪音
 * （見 issue #476 的決策）。
 */
export default function AedMapLeaflet({
  facilities,
  userLocation,
  radiusMeters = 5000,
}: AedMapLeafletProps) {
  const validMarkers = useMemo(() => {
    return facilities.filter(
      (f) =>
        f.lat != null &&
        f.lng != null &&
        Number.isFinite(Number(f.lat)) &&
        Number.isFinite(Number(f.lng)),
    );
  }, [facilities]);

  const markers: BaseMapMarker[] = useMemo(
    () =>
      validMarkers.map((item) => {
        const extra = (item.extra_json as any) || {};
        const is24h = Boolean(
          extra.open24Hours ||
            item.service_time?.includes("24小時") ||
            item.service_time?.includes("全天候"),
        );
        const lat = Number(item.lat);
        const lng = Number(item.lng);

        return {
          id: `aed-${item.id}`,
          lat,
          lng,
          label: item.name,
          sublabel: item.address ?? undefined,
          icon: is24h ? aed24hIcon : aedNormalIcon,
          popup: (
            <div className="min-w-[200px] text-xs leading-relaxed text-slate-800">
              <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-1.5">
                <span className="font-extrabold text-indigo-700 text-sm">{item.name}</span>
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${
                    is24h ? "bg-emerald-600" : "bg-indigo-600"
                  }`}
                >
                  {is24h ? "24H 可取" : "開放時間限時"}
                </span>
              </div>

              <div className="mt-2 rounded bg-indigo-50/70 p-2 text-indigo-900">
                <p className="font-bold text-[11px] text-indigo-600">📍 確切放置位置：</p>
                <p className="font-semibold text-xs mt-0.5">
                  {item.service_item || extra.locationDesc || "請洽現場服務台"}
                </p>
              </div>

              {item.service_time && (
                <p className="mt-1.5 text-slate-600">
                  🕒 開放時間：{item.service_time}
                </p>
              )}

              {item.address && (
                <p className="mt-1 text-slate-500 line-clamp-1">
                  🏠 {item.address}
                </p>
              )}

              {item.phone && (
                <p className="mt-1 text-slate-500">
                  📞 {item.phone}
                </p>
              )}

              <div className="mt-2.5 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
                <a
                  href={appendOutboundUtm(
                    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
                    { medium: "map_navigation", campaign: "map_directions" },
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-indigo-700 transition"
                >
                  🗺️ 一鍵路線導航
                </a>
                {item.phone && (
                  <a
                    href={`tel:${item.phone.replace(/[^0-9]/g, "")}`}
                    className="inline-flex items-center justify-center rounded border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    撥號
                  </a>
                )}
              </div>
              <PopupNearbyToolsLinks lat={lat} lng={lng} />
            </div>
          ),
        };
      }),
    [validMarkers],
  );

  return (
    <BaseMap
      markers={markers}
      userLocation={{ lat: userLocation.lat, lng: userLocation.lng, isDefault: userLocation.isDefault }}
      circle={
        userLocation.lat && userLocation.lng
          ? {
              center: [userLocation.lat, userLocation.lng],
              radiusMeters,
              pathOptions: { color: "#4f46e5", fillColor: "#6366f1", fillOpacity: 0.08, weight: 1.5, dashArray: "4, 6" },
            }
          : undefined
      }
    />
  );
}
