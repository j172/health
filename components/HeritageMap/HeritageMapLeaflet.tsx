"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import type { HeritageCategory } from "@/lib/server/culture/ingestHeritageAssets";
import type { HeritageAssetPoint } from "@/lib/server/culture/queries";
import type { BaseMapMarker } from "@/components/Map/BaseMap";
import { GEO_DEFAULTS } from "@/lib/constants/geoDefaults";
import PopupNearbyToolsLinks from "@/components/Map/PopupNearbyToolsLinks";

const BaseMap = dynamic(() => import("@/components/Map/BaseMap"), { ssr: false });

const CATEGORY_COLORS: Record<HeritageCategory, string> = {
  building: "#b45309", // amber — 古蹟／歷史建築
  archaeological_site: "#7c3aed", // violet — 考古遺址
  memorial_building: "#0284c7", // sky blue — 紀念建築
  settlement: "#059669", // emerald — 聚落建築群
  historical_site: "#dc2626", // red — 史蹟
  cultural_landscape: "#16a34a", // green — 文化景觀
};

const CATEGORY_EMOJI: Record<HeritageCategory, string> = {
  building: "🏛️",
  archaeological_site: "🏺",
  memorial_building: "🏢",
  settlement: "🏘️",
  historical_site: "📜",
  cultural_landscape: "🏞️",
};

const CATEGORY_LABELS: Record<HeritageCategory, string> = {
  building: "古蹟／歷史建築",
  archaeological_site: "考古遺址",
  memorial_building: "紀念建築",
  settlement: "聚落建築群",
  historical_site: "史蹟",
  cultural_landscape: "文化景觀",
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
  memorial_building: makeIcon("memorial_building"),
  settlement: makeIcon("settlement"),
  historical_site: makeIcon("historical_site"),
  cultural_landscape: makeIcon("cultural_landscape"),
};

const TRUNCATE_LENGTH = 120;

/** Truncates a long history/registration-reason text with a "顯示全文/收合"
 * toggle button — the full text can run to thousands of characters and must
 * never be dumped whole into a Leaflet popup (docs/archive/specs/heritage-assets-map.md 5). */
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
  userLocation?: { lat: number; lng: number; isDefault: boolean };
  center?: [number, number];
  zoom?: number;
}

/**
 * 文化資產地圖（issue #476：改用共用 BaseMap，底圖改為國土測繪中心＋OSM 備援，
 * 標記群聚改為共用邏輯）。`HeritageMapContent.tsx` 沒有自己的定位按鈕也沒有
 * 清單／地圖切換，所以沿用 BaseMap 預設開啟的內建定位按鈕（僅在傳入
 * `refresh` 時出現，這裡沒有傳入）與清單／地圖切換。
 */
export default function HeritageMapLeaflet({
  points,
  userLocation,
  center,
  zoom = 13,
}: HeritageMapProps) {
  const mapCenter: [number, number] = center ?? [userLocation?.lat ?? GEO_DEFAULTS.lat, userLocation?.lng ?? GEO_DEFAULTS.lng];

  const markers: BaseMapMarker[] = useMemo(
    () =>
      points.map((p) => {
        const typeLabel = p.assetsTypeNames || p.classifyName || CATEGORY_LABELS[p.category];
        const summary = p.pastHistory || p.registerReason;

        return {
          id: `${p.category}-${p.id}`,
          lat: p.lat,
          lng: p.lng,
          label: p.caseName,
          sublabel: p.address ? `${p.cityName ?? ""}${p.distName ?? ""}${p.address}` : undefined,
          icon: ICONS[p.category],
          popup: (
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
              <PopupNearbyToolsLinks lat={p.lat} lng={p.lng} />
            </div>
          ),
        };
      }),
    [points],
  );

  return (
    <BaseMap
      markers={markers}
      center={mapCenter}
      zoom={zoom}
      userLocation={userLocation}
    />
  );
}
