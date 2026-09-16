"use client";

import React, { useMemo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, Circle } from "react-leaflet";
import type { FacilityListItem } from "@/lib/server/facilities/queries";
import MapViewController, { userLocationIcon } from "@/components/Common/MapViewController";
import { GEO_DEFAULTS, type GeoLocation } from "@/components/Facilities/useGeolocation";

// Webpack/Turbopack Leaflet default icon fix
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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
  userLocation: GeoLocation;
  radiusMeters?: number;
  selectedAedId?: number | null;
  onSelectAed?: (id: number) => void;
}

export default function AedMapLeaflet({
  facilities,
  userLocation,
  radiusMeters = 5000,
}: AedMapLeafletProps) {
  const center: [number, number] = useMemo(() => {
    if (userLocation.lat && userLocation.lng) {
      return [userLocation.lat, userLocation.lng];
    }
    return [GEO_DEFAULTS.lat, GEO_DEFAULTS.lng];
  }, [userLocation.lat, userLocation.lng]);

  const validMarkers = useMemo(() => {
    return facilities.filter(
      (f) =>
        f.lat != null &&
        f.lng != null &&
        Number.isFinite(Number(f.lat)) &&
        Number.isFinite(Number(f.lng)),
    );
  }, [facilities]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={13}
        className="h-full w-full rounded-2xl"
        scrollWheelZoom
      >
        <MapViewController center={center} zoom={13} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 使用者位置與搜尋半徑 */}
        {userLocation.lat && userLocation.lng && (
          <>
            <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon}>
              <Popup>
                <div className="text-xs font-bold leading-relaxed">
                  {userLocation.isDefault ? "📍 預設位置（台北101）" : "🎯 您的目前位置"}
                </div>
              </Popup>
            </Marker>
            <Circle
              center={[userLocation.lat, userLocation.lng]}
              radius={radiusMeters}
              pathOptions={{
                color: "#4f46e5",
                fillColor: "#6366f1",
                fillOpacity: 0.08,
                weight: 1.5,
                dashArray: "4, 6",
              }}
            />
          </>
        )}

        {/* AED Markers */}
        {validMarkers.map((item) => {
          const extra = (item.extra_json as any) || {};
          const is24h = Boolean(
            extra.open24Hours ||
              item.service_time?.includes("24小時") ||
              item.service_time?.includes("全天候"),
          );
          const icon = is24h ? aed24hIcon : aedNormalIcon;
          const lat = Number(item.lat);
          const lng = Number(item.lng);

          return (
            <Marker key={`aed-${item.id}`} position={[lat, lng]} icon={icon}>
              <Popup>
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
                      href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
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
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* 地圖懸浮定位按鈕 */}
      <div className="absolute top-3 right-3 z-[1000]">
        <button
          type="button"
          onClick={() => userLocation.refresh()}
          disabled={userLocation.refreshing}
          title="重新定位至我的位置"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-md transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          {userLocation.refreshing ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          ) : (
            <span className="text-base">🎯</span>
          )}
        </button>
      </div>
    </div>
  );
}
