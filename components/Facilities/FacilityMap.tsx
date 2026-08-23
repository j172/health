"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { GEO_DEFAULTS } from "./useGeolocation";

// Webpack/Turbopack breaks Leaflet's default marker icon URL resolution — point it at a CDN instead.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const userIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#625df5;border:3px solid #fff;box-shadow:0 0 0 2px #625df5;"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

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
  userLocation: { lat: number; lng: number; isDefault: boolean };
  markers: MapMarker[];
  showRadius?: boolean;
  radiusMeters?: number;
}

/** 機構地圖（Leaflet + OpenStreetMap，免API金鑰）。SSR不安全，需以 dynamic({ ssr: false }) 載入。 */
export default function FacilityMap({ userLocation, markers, showRadius = true, radiusMeters = 5000 }: FacilityMapProps) {
  const center: [number, number] = [userLocation.lat ?? GEO_DEFAULTS.lat, userLocation.lng ?? GEO_DEFAULTS.lng];

  return (
    <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom>
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
  );
}
