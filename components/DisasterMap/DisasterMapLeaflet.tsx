"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type { DisasterLayer } from "@/lib/server/disaster/ingestDisasterPoints";
import type { DisasterPoint } from "@/lib/server/disaster/queries";

// Webpack/Turbopack breaks Leaflet's default marker icon URL resolution — point it at a CDN instead (same fix as FacilityMap.tsx).
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const LAYER_COLORS: Record<DisasterLayer, string> = {
  shelter: "#16a34a", // green — 避難收容處所
  rescue_unit: "#dc2626", // red — 消防救援單位
  eoc_center: "#2563eb", // blue — 應變中心
};

const LAYER_EMOJI: Record<DisasterLayer, string> = {
  shelter: "🏫",
  rescue_unit: "🚒",
  eoc_center: "🏢",
};

const makeIcon = (layer: DisasterLayer) =>
  new L.DivIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${LAYER_COLORS[layer]};border:2px solid #fff;box-shadow:0 0 0 1.5px ${LAYER_COLORS[layer]};display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });

const ICONS: Record<DisasterLayer, L.DivIcon> = {
  shelter: makeIcon("shelter"),
  rescue_unit: makeIcon("rescue_unit"),
  eoc_center: makeIcon("eoc_center"),
};

const LAYER_LABELS: Record<DisasterLayer, string> = {
  shelter: "避難收容處所",
  rescue_unit: "消防救援單位",
  eoc_center: "應變中心",
};

import MapViewController, { userLocationIcon } from "@/components/Common/MapViewController";
import { GEO_DEFAULTS } from "@/components/Facilities/useGeolocation";

const boolLabel = (v: boolean | null): string | null => {
  if (v === null) return null;
  return v ? "是" : "否";
};

import type { InundationPoint } from "@/lib/server/wra/inundation";
import type { DamStructureMapPoint } from "@/lib/server/wra/damStructureQueries";
import type { GroundwaterMapPoint } from "@/lib/server/wra/groundwaterQueries";

const makeInundationIcon = (status: "normal" | "warning" | "critical") => {
  const color = status === "critical" ? "#dc2626" : status === "warning" ? "#d97706" : "#0284c7";
  return new L.DivIcon({
    className: "",
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 2px ${color};display:flex;align-items:center;justify-content:center;font-size:11px;">🌊</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
};

// 水利署水資源物聯網 (iot.wra.gov.tw) 圖層 icons — issue #270.
const damStructureIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#d97706;border:2px solid #fff;box-shadow:0 0 0 1.5px #d97706;display:flex;align-items:center;justify-content:center;font-size:10px;">🧱</div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -9],
});

const groundwaterIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#0d9488;border:2px solid #fff;box-shadow:0 0 0 1.5px #0d9488;display:flex;align-items:center;justify-content:center;font-size:10px;">💧</div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -9],
});

export interface DisasterMapProps {
  points: DisasterPoint[];
  inundationPoints?: InundationPoint[];
  damStructurePoints?: DamStructureMapPoint[];
  groundwaterPoints?: GroundwaterMapPoint[];
  userLocation?: { lat: number; lng: number; isDefault: boolean };
  center?: [number, number];
  zoom?: number;
}

/** 防災地圖（Leaflet + OpenStreetMap，免API金鑰）。SSR不安全，需以 dynamic({ ssr: false }) 載入。 */
export default function DisasterMapLeaflet({
  points,
  inundationPoints = [],
  damStructurePoints = [],
  groundwaterPoints = [],
  userLocation,
  center = [userLocation?.lat ?? GEO_DEFAULTS.lat, userLocation?.lng ?? GEO_DEFAULTS.lng],
  zoom = 13,
}: DisasterMapProps) {
  const mapCenter: [number, number] = center || [userLocation?.lat ?? GEO_DEFAULTS.lat, userLocation?.lng ?? GEO_DEFAULTS.lng];

  return (
    <MapContainer center={mapCenter} zoom={zoom} className="h-full w-full" scrollWheelZoom>
      <MapViewController center={mapCenter} zoom={zoom} />
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon}>
          <Popup>{userLocation.isDefault ? "預設位置：台北101" : "您目前的位置"}</Popup>
        </Marker>
      )}

      {inundationPoints.map((ip) => (
        <Marker key={ip.id} position={[ip.lat, ip.lng]} icon={makeInundationIcon(ip.status)}>
          <Popup>
            <div className="text-sm leading-relaxed">
              <p className="text-xs font-bold text-sky-600">🌊 即時路面積淹水／水情警戒</p>
              <p className="font-semibold text-neutral-900">{ip.name}</p>
              <div className="mt-1 text-xs">
                <span className={`inline-block px-2 py-0.5 rounded font-bold ${
                  ip.status === "critical"
                    ? "bg-red-100 text-red-700"
                    : ip.status === "warning"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-sky-100 text-sky-700"
                }`}>
                  {ip.statusText}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-600">{ip.county} {ip.district} {ip.address}</p>
              <p className="mt-1 text-[10px] text-neutral-400">資料來源：{ip.source}</p>
            </div>
          </Popup>
        </Marker>
      ))}

      {damStructurePoints.map((s) => (
        <Marker key={`dam-structure-${s.stationId}`} position={[s.lat, s.lng]} icon={damStructureIcon}>
          <Popup>
            <div className="text-sm leading-relaxed">
              <p className="text-xs font-bold text-amber-600">🧱 堤防結構安全監測</p>
              <p className="font-semibold text-neutral-900">{s.name}</p>
              <p className="mt-1 text-xs text-neutral-600">
                {s.countyName} {s.townName}
              </p>
              {s.measurements.length > 0 && (
                <div className="mt-1.5 space-y-0.5 border-t border-neutral-100 pt-1.5 text-xs text-neutral-700">
                  {s.measurements.map((m, i) => (
                    <p key={i}>
                      {m.fullName || m.name}：{m.value ?? "—"} {m.unit ?? ""}
                    </p>
                  ))}
                </div>
              )}
              {s.recordedAt && <p className="mt-1 text-[10px] text-neutral-400">觀測時間：{s.recordedAt}</p>}
              <p className="mt-1 text-[10px] text-neutral-400">資料來源：經濟部水利署水資源物聯網</p>
            </div>
          </Popup>
        </Marker>
      ))}

      {groundwaterPoints.map((s) => (
        <Marker key={`groundwater-${s.stationId}`} position={[s.lat, s.lng]} icon={groundwaterIcon}>
          <Popup>
            <div className="text-sm leading-relaxed">
              <p className="text-xs font-bold text-teal-600">💧 地下水位監測</p>
              <p className="font-semibold text-neutral-900">{s.name}</p>
              <p className="mt-1 text-xs text-neutral-600">
                {s.countyName} {s.townName}
              </p>
              <p className="mt-1 text-xs text-neutral-700">
                地下水位：{s.waterLevelM !== null ? `${s.waterLevelM} m` : "無資料"}
              </p>
              {s.recordedAt && <p className="mt-1 text-[10px] text-neutral-400">觀測時間：{s.recordedAt}</p>}
              <p className="mt-1 text-[10px] text-neutral-400">資料來源：經濟部水利署水資源物聯網</p>
            </div>
          </Popup>
        </Marker>
      ))}

      {points.map((p) => (
        <Marker key={`${p.layer}-${p.id}`} position={[p.lat, p.lng]} icon={ICONS[p.layer]}>
          <Popup>
            <div className="text-sm leading-relaxed">
              <p className="text-xs font-semibold" style={{ color: LAYER_COLORS[p.layer] }}>
                {LAYER_EMOJI[p.layer]} {LAYER_LABELS[p.layer]}
              </p>
              <p className="font-semibold text-neutral-900">{p.name}</p>
              {p.address && <p className="text-neutral-600">{p.address}</p>}
              {p.phone && (
                <p className="text-blue-600">
                  <a href={`tel:${p.phone}`}>{p.phone}</a>
                </p>
              )}

              {p.layer === "shelter" && (
                <div className="mt-1.5 space-y-0.5 border-t border-neutral-100 pt-1.5 text-xs text-neutral-700">
                  {p.capacity !== null && <p>預計收容人數：約 {p.capacity} 人</p>}
                  {p.disasterTypes && <p>適用災害類別：{p.disasterTypes}</p>}
                  {(p.indoor !== null || p.outdoor !== null) && (
                    <p>
                      {p.indoor !== null && <>室內：{boolLabel(p.indoor)}　</>}
                      {p.outdoor !== null && <>室外：{boolLabel(p.outdoor)}</>}
                    </p>
                  )}
                  {p.weakSuitable !== null && <p>適合避難弱者安置：{boolLabel(p.weakSuitable)}</p>}
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
