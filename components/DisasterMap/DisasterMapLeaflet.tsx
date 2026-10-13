"use client";

import React from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import type { DisasterLayer } from "@/lib/server/disaster/ingestDisasterPoints";
import type { DisasterPoint } from "@/lib/server/disaster/queries";
import type { BaseMapMarker } from "@/components/Map/BaseMap";
import { GEO_DEFAULTS } from "@/lib/constants/geoDefaults";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import PopupNearbyToolsLinks from "@/components/Map/PopupNearbyToolsLinks";

const BaseMap = dynamic(() => import("@/components/Map/BaseMap"), { ssr: false });

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

import type { InundationPoint } from "@/lib/server/wra/inundation";
import type { DamStructureMapPoint } from "@/lib/server/wra/damStructureQueries";
import type { GroundwaterMapPoint } from "@/lib/server/wra/groundwaterQueries";
import type { DebrisFlowAlertItem } from "@/lib/server/moa/types";

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

const INUNDATION_ICONS: Record<"normal" | "warning" | "critical", L.DivIcon> = {
  normal: makeInundationIcon("normal"),
  warning: makeInundationIcon("warning"),
  critical: makeInundationIcon("critical"),
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

// 農業部農村水保署土石流紅黃警戒 icon
const makeDebrisFlowIcon = (level: "yellow" | "red") =>
  new L.DivIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${level === "red" ? "#dc2626" : "#f59e0b"};border:2px solid #fff;box-shadow:0 0 0 2px ${level === "red" ? "#dc2626" : "#f59e0b"};display:flex;align-items:center;justify-content:center;font-size:11px;">⚠️</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  });

const DEBRIS_FLOW_ICONS: Record<"yellow" | "red", L.DivIcon> = {
  yellow: makeDebrisFlowIcon("yellow"),
  red: makeDebrisFlowIcon("red"),
};

export interface DisasterMapProps {
  points: DisasterPoint[];
  inundationPoints?: InundationPoint[];
  damStructurePoints?: DamStructureMapPoint[];
  groundwaterPoints?: GroundwaterMapPoint[];
  debrisFlowPoints?: DebrisFlowAlertItem[];
  userLocation?: { lat: number; lng: number; isDefault: boolean; refresh?: () => void; refreshing?: boolean };
  center?: [number, number];
  zoom?: number;
}

function haversineDistKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 防災地圖（issue #476：改用共用 BaseMap，底圖改為國土測繪中心＋OSM 備援，
 * 標記群聚改為共用邏輯）。
 *
 * 不把 `userLocation.refresh` 轉接給 BaseMap 的內建定位按鈕——`DisasterMapContent.tsx`
 * 已經有自己的 `MapLocationBanner`（見 issue #476 的決策）。
 */
export default function DisasterMapLeaflet({
  points,
  inundationPoints = [],
  damStructurePoints = [],
  groundwaterPoints = [],
  debrisFlowPoints = [],
  userLocation,
  center,
  zoom = 13,
}: DisasterMapProps) {
  const mapCenter: [number, number] = center || [userLocation?.lat ?? GEO_DEFAULTS.lat, userLocation?.lng ?? GEO_DEFAULTS.lng];

  // 效能保護：當點位超過 400 筆時，依據中心距離排序取最近的 400 處，避免 5,900 個 DOM Marker 造成瀏覽器當機或卡死
  const cappedPoints = React.useMemo(() => {
    if (points.length <= 400) return points;
    const cLat = mapCenter[0];
    const cLng = mapCenter[1];
    return [...points]
      .sort((a, b) => {
        const da = haversineDistKm(cLat, cLng, a.lat, a.lng);
        const db = haversineDistKm(cLat, cLng, b.lat, b.lng);
        return da - db;
      })
      .slice(0, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, mapCenter[0], mapCenter[1]]);

  const markers: BaseMapMarker[] = React.useMemo(() => {
    const inundationMarkers: BaseMapMarker[] = inundationPoints.map((ip) => ({
      id: `inundation-${ip.id}`,
      lat: ip.lat,
      lng: ip.lng,
      label: ip.name,
      sublabel: `${ip.county} ${ip.district}`,
      icon: INUNDATION_ICONS[ip.status],
      popup: (
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
          <PopupNearbyToolsLinks lat={ip.lat} lng={ip.lng} />
        </div>
      ),
    }));

    const damStructureMarkers: BaseMapMarker[] = damStructurePoints.map((s) => ({
      id: `dam-structure-${s.stationId}`,
      lat: s.lat,
      lng: s.lng,
      label: s.name,
      sublabel: `${s.countyName} ${s.townName}`,
      icon: damStructureIcon,
      popup: (
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
          <PopupNearbyToolsLinks lat={s.lat} lng={s.lng} />
        </div>
      ),
    }));

    const groundwaterMarkers: BaseMapMarker[] = groundwaterPoints.map((s) => ({
      id: `groundwater-${s.stationId}`,
      lat: s.lat,
      lng: s.lng,
      label: s.name,
      sublabel: `${s.countyName} ${s.townName}`,
      icon: groundwaterIcon,
      popup: (
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
          <PopupNearbyToolsLinks lat={s.lat} lng={s.lng} />
        </div>
      ),
    }));

    const layerMarkers: BaseMapMarker[] = cappedPoints.map((p) => ({
      id: `${p.layer}-${p.id}`,
      lat: p.lat,
      lng: p.lng,
      label: p.name,
      sublabel: p.address ?? undefined,
      icon: ICONS[p.layer],
      popup: (
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

          <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between gap-1">
            <a
              href={appendOutboundUtm(
                `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`,
                { medium: "map_navigation", campaign: "map_directions" },
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center rounded bg-indigo-600 py-1 text-[10px] font-bold text-white hover:bg-indigo-700 transition"
            >
              🗺️ 路線導航
            </a>
            {p.phone && (
              <a
                href={`tel:${p.phone}`}
                className="inline-flex items-center justify-center rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                撥號
              </a>
            )}
          </div>
          <PopupNearbyToolsLinks lat={p.lat} lng={p.lng} />
        </div>
      ),
    }));

    const debrisFlowMarkers: BaseMapMarker[] = debrisFlowPoints.map((df) => ({
      id: `debris-flow-${df.debrisId}`,
      lat: df.lat,
      lng: df.lng,
      label: df.streamName,
      sublabel: `${df.county} ${df.township}`,
      icon: DEBRIS_FLOW_ICONS[df.alertLevel],
      popup: (
        <div className="p-1 min-w-[200px] text-xs">
          <div className="flex items-center gap-1.5 font-bold">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] text-white ${
                df.alertLevel === "red" ? "bg-red-600" : "bg-amber-500"
              }`}
            >
              {df.alertLevel === "red" ? "🔴 紅色警戒" : "🟡 黃色警戒"}
            </span>
            <span className="truncate">{df.streamName}</span>
          </div>
          <div className="mt-1.5 space-y-1 text-slate-600 dark:text-slate-300">
            <p>📍 {df.county} {df.township} {df.village || ""}</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">{df.advisory}</p>
            {df.rainfallThresholdMm && (
              <p className="text-[11px] text-slate-500">雨量警戒基準值: {df.rainfallThresholdMm} mm</p>
            )}
          </div>
          <div className="mt-2 pt-1 border-t border-slate-100">
            <a
              href={appendOutboundUtm(
                `https://www.google.com/maps/dir/?api=1&destination=${df.lat},${df.lng}`,
                { medium: "map_navigation", campaign: "map_directions" },
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded bg-amber-600 py-1 px-2.5 text-[10px] font-bold text-white hover:bg-amber-700 transition"
            >
              路線導航 ↗
            </a>
          </div>
          <PopupNearbyToolsLinks lat={df.lat} lng={df.lng} />
        </div>
      ),
    }));

    return [...inundationMarkers, ...damStructureMarkers, ...groundwaterMarkers, ...layerMarkers, ...debrisFlowMarkers];
  }, [inundationPoints, damStructurePoints, groundwaterPoints, cappedPoints, debrisFlowPoints]);

  return (
    <div className="relative h-full w-full">
      <BaseMap
        markers={markers}
        center={mapCenter}
        zoom={zoom}
        userLocation={
          userLocation ? { lat: userLocation.lat, lng: userLocation.lng, isDefault: userLocation.isDefault } : undefined
        }
      />

      {/* 點位數量狀態指示 */}
      {points.length > 400 && (
        <div className="absolute bottom-2 left-2 z-[1000] rounded-lg bg-slate-900/80 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-xs">
          ⚡ 為維持流暢度，地圖顯示中心周邊 400 處設施（全台共 {points.length} 筆）
        </div>
      )}
    </div>
  );
}
