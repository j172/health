"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type { DengueVillagePoint } from "@/lib/server/dengue/queries";
import MapViewController, { userLocationIcon } from "@/components/Common/MapViewController";
import { GEO_DEFAULTS } from "@/components/Facilities/useGeolocation";

// Webpack/Turbopack breaks Leaflet's default marker icon URL resolution — point it at a CDN instead (same fix as DisasterMapLeaflet.tsx / HeritageMapLeaflet.tsx).
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/**
 * Marker color keyed to the CDC's own 布氏指數 (BI) 0-9 density grade
 * (bi_lv — see lib/server/tools/catalog.ts's dengue-mosquito-map
 * referenceTable for the full CDC classification table this mirrors). A
 * plain low→high gradient, not an assertion of an official "action
 * threshold" — the CDC page verified for this tool doesn't publish one.
 */
const levelColor = (lv: number | null): string => {
  if (lv === null) return "#94a3b8"; // slate — 無資料
  if (lv <= 0) return "#16a34a"; // green — 0 級（未發現陽性）
  if (lv <= 2) return "#65a30d"; // lime
  if (lv <= 4) return "#d97706"; // amber
  if (lv <= 6) return "#ea580c"; // orange
  return "#dc2626"; // red — 7-9 級
};

const makeIcon = (lv: number | null) => {
  const color = levelColor(lv);
  return new L.DivIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 1.5px ${color};display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
};

// Cache icons per level (0-9 + null) instead of constructing one per marker.
const ICON_CACHE = new Map<number | null, L.DivIcon>();
const iconForLevel = (lv: number | null): L.DivIcon => {
  const key = lv === null ? null : lv;
  const cached = ICON_CACHE.get(key);
  if (cached) return cached;
  const icon = makeIcon(key);
  ICON_CACHE.set(key, icon);
  return icon;
};

const fmtIndex = (v: number | null): string => (v === null ? "無資料" : String(v));
const fmtLevel = (lv: number | null): string => (lv === null ? "無資料" : `${lv} 級`);

export interface DengueMosquitoMapProps {
  points: DengueVillagePoint[];
  userLocation?: { lat: number; lng: number; isDefault: boolean };
  center?: [number, number];
  zoom?: number;
}

/** 登革熱病媒蚊密度地圖（Leaflet + OpenStreetMap，免API金鑰）。SSR不安全，需以 dynamic({ ssr: false }) 載入。 */
export default function DengueMosquitoMapLeaflet({
  points,
  userLocation,
  center = [userLocation?.lat ?? GEO_DEFAULTS.lat, userLocation?.lng ?? GEO_DEFAULTS.lng],
  zoom = 13,
}: DengueMosquitoMapProps) {
  const mapCenter: [number, number] =
    center || [userLocation?.lat ?? GEO_DEFAULTS.lat, userLocation?.lng ?? GEO_DEFAULTS.lng];

  return (
    <MapContainer center={mapCenter} zoom={zoom} className="h-full w-full" scrollWheelZoom>
      <MapViewController center={mapCenter} zoom={zoom} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon}>
          <Popup>{userLocation.isDefault ? "預設位置：台北101" : "您目前的位置"}</Popup>
        </Marker>
      )}

      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={iconForLevel(p.biLv)}>
          <Popup>
            <div className="text-sm leading-relaxed">
              <p className="text-xs font-semibold text-rose-600">🦟 登革熱病媒蚊密度調查</p>
              <p className="font-semibold text-neutral-900">
                {p.county} {p.town} {p.village}
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-500">調查日期：{p.surveyDate}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-neutral-100 pt-1.5 text-xs text-neutral-700">
                <p>布氏指數 (BI)：{fmtIndex(p.bi)}（{fmtLevel(p.biLv)}）</p>
                <p>住宅指數 (HI)：{fmtIndex(p.hi)}（{fmtLevel(p.hiLv)}）</p>
                <p>容器指數 (CI)：{fmtIndex(p.ci)}（{fmtLevel(p.ciLv)}）</p>
                <p>幼蟲指數 (LI)：{fmtIndex(p.li)}（{fmtLevel(p.liLv)}）</p>
                <p>成蟲指數 (AI)：{fmtIndex(p.ai)}</p>
                <p>每百戶容器數：{fmtIndex(p.con100hh)}</p>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
