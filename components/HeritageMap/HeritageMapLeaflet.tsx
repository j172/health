"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type { HeritageCategory } from "@/lib/server/culture/ingestHeritageAssets";
import type { HeritageAssetPoint } from "@/lib/server/culture/queries";

// Webpack/Turbopack breaks Leaflet's default marker icon URL resolution — point it at a CDN instead (same fix as FacilityMap.tsx / DisasterMapLeaflet.tsx).
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const CATEGORY_COLORS: Record<HeritageCategory, string> = {
  building: "#b45309", // amber — 古蹟／歷史建築
  archaeological_site: "#7c3aed", // violet — 考古遺址
};

const CATEGORY_EMOJI: Record<HeritageCategory, string> = {
  building: "🏛️",
  archaeological_site: "🏺",
};

const CATEGORY_LABELS: Record<HeritageCategory, string> = {
  building: "古蹟／歷史建築",
  archaeological_site: "考古遺址",
};

const makeIcon = (category: HeritageCategory) =>
  new L.DivIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${CATEGORY_COLORS[category]};border:2px solid #fff;box-shadow:0 0 0 1.5px ${CATEGORY_COLORS[category]};display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });

const ICONS: Record<HeritageCategory, L.DivIcon> = {
  building: makeIcon("building"),
  archaeological_site: makeIcon("archaeological_site"),
};

const TRUNCATE_LENGTH = 120;

/** Truncates a long history/registration-reason text with a "顯示全文/收合"
 * toggle button — the full text can run to thousands of characters and must
 * never be dumped whole into a Leaflet popup (docs/specs/heritage-assets-map.md 5). */
function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > TRUNCATE_LENGTH;
  const display = expanded || !isLong ? text : `${text.slice(0, TRUNCATE_LENGTH)}…`;

  return (
    <div className="mt-1">
      <p className="whitespace-pre-wrap text-neutral-700">{display}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-xs font-semibold text-indigo-600 hover:underline"
        >
          {expanded ? "收合" : "顯示全文"}
        </button>
      )}
    </div>
  );
}

export interface HeritageMapProps {
  points: HeritageAssetPoint[];
  center?: [number, number];
  zoom?: number;
}

/** 文化資產地圖（Leaflet + OpenStreetMap，免API金鑰）。SSR不安全，需以 dynamic({ ssr: false }) 載入。 */
export default function HeritageMapLeaflet({
  points,
  center = [23.6978, 120.9605], // 台灣地理中心附近
  zoom = 8,
}: HeritageMapProps) {
  return (
    <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {points.map((p) => {
        const typeLabel = p.assetsTypeNames || p.classifyName || CATEGORY_LABELS[p.category];
        const summary = p.pastHistory || p.registerReason;

        return (
          <Marker key={`${p.category}-${p.id}`} position={[p.lat, p.lng]} icon={ICONS[p.category]}>
            <Popup maxWidth={280}>
              <div className="text-sm leading-relaxed">
                <p className="text-xs font-semibold" style={{ color: CATEGORY_COLORS[p.category] }}>
                  {CATEGORY_EMOJI[p.category]} {CATEGORY_LABELS[p.category]}
                </p>
                <p className="font-semibold text-neutral-900">{p.caseName}</p>
                {typeLabel && <p className="text-neutral-600">{typeLabel}</p>}
                {p.address && (
                  <p className="text-neutral-600">
                    {p.cityName}
                    {p.distName}
                    {p.address}
                  </p>
                )}

                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- remote BOCH image inside a Leaflet popup, next/image's optimizer isn't set up for this host
                  <img
                    src={p.imageUrl}
                    alt={p.caseName}
                    className="mt-1.5 max-h-32 w-full rounded-md object-cover"
                    loading="lazy"
                  />
                )}
                {p.imageSource && (
                  <p className="mt-0.5 text-[10px] text-neutral-400">圖片來源：{p.imageSource}</p>
                )}

                {summary && (
                  <div className="mt-1.5 border-t border-neutral-100 pt-1.5 text-xs">
                    <ExpandableText text={summary} />
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
