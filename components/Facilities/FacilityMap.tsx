"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { GEO_DEFAULTS } from "./useGeolocation";

import MapViewController, { userLocationIcon } from "@/components/Common/MapViewController";

// Webpack/Turbopack breaks Leaflet's default marker icon URL resolution — point it at a CDN instead.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const userIcon = userLocationIcon;

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

/** 機構地圖（Leaflet + OpenStreetMap，免API金鑰）。SSR不安全，需以 dynamic({ ssr: false }) 載入。 */
export default function FacilityMap({ userLocation, markers, showRadius = true, radiusMeters = 5000 }: FacilityMapProps) {
  const center: [number, number] = [userLocation.lat ?? GEO_DEFAULTS.lat, userLocation.lng ?? GEO_DEFAULTS.lng];

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom>
        <MapViewController center={center} zoom={13} />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <Marker position={center} icon={userIcon}>
          <Popup>{userLocation.isDefault ? "預設位置" : "您目前的位置"}</Popup>
        </Marker>

        {showRadius && <Circle center={center} radius={radiusMeters} pathOptions={{ color: "#625df5", fillColor: "#625df5", fillOpacity: 0.07 }} />}

        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]}>
            <Popup>
              <div className="text-sm leading-relaxed">
                <p className="font-semibold text-neutral-900">{m.name}</p>
                {m.address && <p className="text-neutral-600">{m.address}</p>}
                {m.phone && <p className="text-blue-600">{m.phone}</p>}
                {m.charityUrl && (
                  <div className="mt-2 pt-1.5 border-t border-neutral-100">
                    <a
                      href={m.charityUrl}
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
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* 懸浮定位按鈕 */}
      {userLocation.refresh && (
        <div className="absolute top-3 right-3 z-[1000]">
          <button
            type="button"
            onClick={() => userLocation.refresh?.()}
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
      )}
    </div>
  );
}
