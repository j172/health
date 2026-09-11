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
  center?: [number, number];
  zoom?: number;
}

export default function ContraceptionMapLeaflet({
  points,
  center = [23.6978, 120.9605],
  zoom = 8,
}: ContraceptionMapProps) {
  return (
    <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {points.map((p) => {
        const isClinic = p.category === "clinic";
        const icon = isClinic ? clinicIcon : pharmacyIcon;
        const badgeClass = isClinic
          ? "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";

        return (
          <Marker key={`${p.category}-${p.id}`} position={[p.lat, p.lng]} icon={icon}>
            <Popup maxWidth={280}>
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
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${p.name} ${p.address}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-indigo-600 hover:underline"
                  >
                    Google 導航 ↗
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
