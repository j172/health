"use client";

import React, { useMemo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type {
  InundationSensorItem,
  InundationShelterPoint,
  InundationAlertLevel,
} from "@/lib/server/inundation/types";
import MapViewController, { userLocationIcon } from "@/components/Common/MapViewController";
import { GEO_DEFAULTS, type GeoLocation } from "@/components/Facilities/useGeolocation";

// Webpack/Turbopack breaks Leaflet's default marker icon URL resolution — point it at a CDN instead
// (same fix as FacilityMap.tsx / DisasterMapLeaflet.tsx / AedMapLeaflet.tsx).
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const SENSOR_COLORS: Record<InundationAlertLevel, string> = {
  normal: "#059669",
  warning: "#d97706",
  critical: "#dc2626",
};

const makeSensorIcon = (level: InundationAlertLevel) =>
  new L.DivIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${SENSOR_COLORS[level]};border:2.5px solid #fff;box-shadow:0 0 0 2px ${SENSOR_COLORS[level]};display:flex;align-items:center;justify-content:center;font-size:12px;">🌊</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  });

const SENSOR_ICONS: Record<InundationAlertLevel, L.DivIcon> = {
  normal: makeSensorIcon("normal"),
  warning: makeSensorIcon("warning"),
  critical: makeSensorIcon("critical"),
};

const shelterIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#16a34a;border:2.5px solid #fff;box-shadow:0 0 0 2px #16a34a;display:flex;align-items:center;justify-content:center;font-size:12px;">🏫</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -11],
});

const ALERT_LABELS: Record<InundationAlertLevel, string> = {
  normal: "通行正常",
  warning: "水位警戒",
  critical: "嚴重積水",
};

export interface InundationMapLeafletProps {
  sensors: InundationSensorItem[];
  shelters: InundationShelterPoint[];
  userLocation?: GeoLocation;
}

export default function InundationMapLeaflet({
  sensors,
  shelters,
  userLocation,
}: InundationMapLeafletProps) {
  const center: [number, number] = useMemo(() => {
    if (userLocation?.lat && userLocation?.lng) {
      return [userLocation.lat, userLocation.lng];
    }
    return [GEO_DEFAULTS.lat, GEO_DEFAULTS.lng];
  }, [userLocation?.lat, userLocation?.lng]);

  const zoom = userLocation && !userLocation.isDefault ? 12 : 8;

  const validSensors = useMemo(
    () =>
      sensors.filter(
        (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng),
      ),
    [sensors],
  );

  const validShelters = useMemo(
    () =>
      shelters.filter(
        (sh) => Number.isFinite(sh.lat) && Number.isFinite(sh.lng),
      ),
    [shelters],
  );

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
        <MapViewController center={center} zoom={zoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {userLocation?.lat && userLocation?.lng && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon}>
            <Popup>
              <div className="text-xs font-bold leading-relaxed">
                {userLocation.isDefault ? "📍 預設位置（臺北101）" : "🎯 您的目前位置"}
              </div>
            </Popup>
          </Marker>
        )}

        {/* 路面淹水感測站 */}
        {validSensors.map((s) => (
          <Marker key={s.sensorId} position={[s.lat, s.lng]} icon={SENSOR_ICONS[s.alertLevel]}>
            <Popup>
              <div className="min-w-[180px] text-xs leading-relaxed text-slate-800">
                <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-1.5">
                  <span className="font-extrabold text-sky-700 text-sm">{s.sensorName}</span>
                  <span
                    className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                    style={{ backgroundColor: SENSOR_COLORS[s.alertLevel] }}
                  >
                    {ALERT_LABELS[s.alertLevel]}
                  </span>
                </div>
                <p className="mt-1.5 text-slate-600">
                  📍 {s.county} {s.township} {s.address || ""}
                </p>
                <div className="mt-2 rounded bg-sky-50/70 p-2 text-sky-900">
                  <p className="flex items-baseline justify-between">
                    <span className="text-[11px] font-bold text-sky-600">即時路面水深</span>
                    <span className="text-sm font-black">{s.waterDepthCm.toFixed(1)} cm</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">警戒門檻：{s.warningDepthCm} cm</p>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400">
                  來源：{s.source}｜{new Date(s.recordedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })} 更新
                </p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* 避難收容處所 */}
        {validShelters.map((sh) => (
          <Marker key={sh.id} position={[sh.lat, sh.lng]} icon={shelterIcon}>
            <Popup>
              <div className="min-w-[180px] text-xs leading-relaxed text-slate-800">
                <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-1.5">
                  <span className="font-extrabold text-emerald-700 text-sm">{sh.name}</span>
                  <span className="inline-block rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    容量 {sh.capacity} 人
                  </span>
                </div>
                <p className="mt-1.5 text-slate-600">
                  📍 {sh.county} {sh.township} {sh.address}
                </p>
                <div className="mt-2.5 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${sh.lat},${sh.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-indigo-700 transition"
                  >
                    🗺️ 路線導航
                  </a>
                  {sh.contactPhone && (
                    <a
                      href={`tel:${sh.contactPhone.replace(/[^0-9]/g, "")}`}
                      className="inline-flex items-center justify-center rounded border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      📞 撥號
                    </a>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* 地圖懸浮定位按鈕 */}
      {userLocation && (
        <div className="absolute top-3 right-3 z-[1000]">
          <button
            type="button"
            onClick={() => userLocation.refresh()}
            disabled={userLocation.refreshing}
            title="重新定位至我的位置"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-md transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {userLocation.refreshing ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
            ) : (
              <span className="text-base">🎯</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
