"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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
  center?: [number, number];
  zoom?: number;
}

export default function BreastfeedingMapLeaflet({
  points,
  center = [23.6978, 120.9605],
  zoom = 8,
}: BreastfeedingMapProps) {
  return (
    <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {points.map((p) => {
        const isStatutory = p.settingType === "statutory";
        const icon = isStatutory ? statutoryIcon : voluntaryIcon;
        const badgeColor = isStatutory ? "text-amber-700 bg-amber-50" : "text-pink-600 bg-pink-50";

        return (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icon}>
            <Popup maxWidth={280}>
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
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${p.name} ${p.address}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-pink-600 hover:underline"
                  >
                    Google 地圖導航 ↗
                  </a>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
