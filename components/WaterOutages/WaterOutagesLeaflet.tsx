"use client";

import React from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type {
  WaterOutageItem,
  EmergencyWaterStation,
} from "@/lib/server/waterOutages/types";
import MapViewController, { userLocationIcon } from "@/components/Common/MapViewController";

// Fix leaflet icon default path issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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

export default function WaterOutagesLeaflet({
  outages,
  waterStations,
  userLocation,
}: WaterOutagesLeafletProps) {
  const defaultCenter: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [23.9738, 120.982]; // 臺灣中心位置

  const defaultZoom = userLocation ? 12 : 8;

  return (
    <div className="h-[450px] w-full">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapViewController center={defaultCenter} zoom={defaultZoom} />

        {/* User Location */}
        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={userLocationIcon}
          >
            <Popup>
              <div className="text-xs font-semibold">📍 您的目前位置</div>
            </Popup>
          </Marker>
        )}

        {/* Outage Points */}
        {outages
          .filter((o) => o.lat && o.lng)
          .map((o) => (
            <Marker key={o.id} position={[o.lat!, o.lng!]} icon={outageIcon}>
              <Popup>
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
                </div>
              </Popup>
            </Marker>
          ))}

        {/* Water Stations */}
        {waterStations
          .filter((s) => s.lat && s.lng)
          .map((s) => (
            <Marker
              key={s.stationId}
              position={[s.lat, s.lng]}
              icon={waterStationIcon}
            >
              <Popup>
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
                      href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-bold text-indigo-600 hover:underline"
                    >
                      開啟 Google 地圖導航 ↗
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
