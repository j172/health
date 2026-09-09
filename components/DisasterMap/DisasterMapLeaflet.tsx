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

const boolLabel = (v: boolean | null): string | null => {
  if (v === null) return null;
  return v ? "是" : "否";
};

export interface DisasterMapProps {
  points: DisasterPoint[];
  center?: [number, number];
  zoom?: number;
}

/** 防災地圖（Leaflet + OpenStreetMap，免API金鑰）。SSR不安全，需以 dynamic({ ssr: false }) 載入。 */
export default function DisasterMapLeaflet({
  points,
  center = [23.6978, 120.9605], // 台灣地理中心附近
  zoom = 8,
}: DisasterMapProps) {
  return (
    <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

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
