"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import type {
  InundationSensorItem,
  InundationShelterPoint,
  InundationAlertLevel,
} from "@/lib/server/inundation/types";
import type { BaseMapMarker } from "@/components/Map/BaseMap";
import type { MapUserLocation } from "@/lib/types/mapUserLocation";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import PopupNearbyToolsLinks from "@/components/Map/PopupNearbyToolsLinks";

const BaseMap = dynamic(() => import("@/components/Map/BaseMap"), { ssr: false });

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
  userLocation?: MapUserLocation;
}

/**
 * 路面淹水感測站＋避難收容處所地圖（issue #476：改用共用 BaseMap，底圖改為
 * 國土測繪中心＋OSM 備援）。
 *
 * 不把 `userLocation.refresh` 轉接給 BaseMap 的內建定位按鈕——`InundationMapContent.tsx`
 * 已經有自己的 `MapLocationBanner`（見 issue #476 的決策）。
 */
export default function InundationMapLeaflet({
  sensors,
  shelters,
  userLocation,
}: InundationMapLeafletProps) {
  const zoom = userLocation && !userLocation.isDefault ? 12 : 8;

  const validSensors = useMemo(
    () => sensors.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)),
    [sensors],
  );

  const validShelters = useMemo(
    () => shelters.filter((sh) => Number.isFinite(sh.lat) && Number.isFinite(sh.lng)),
    [shelters],
  );

  const markers: BaseMapMarker[] = useMemo(() => {
    const sensorMarkers: BaseMapMarker[] = validSensors.map((s) => ({
      id: `sensor-${s.sensorId}`,
      lat: s.lat,
      lng: s.lng,
      label: s.sensorName,
      sublabel: `${s.county} ${s.township}`,
      icon: SENSOR_ICONS[s.alertLevel],
      popup: (
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
          <PopupNearbyToolsLinks lat={s.lat} lng={s.lng} />
        </div>
      ),
    }));

    const shelterMarkers: BaseMapMarker[] = validShelters.map((sh) => ({
      id: `shelter-${sh.id}`,
      lat: sh.lat,
      lng: sh.lng,
      label: sh.name,
      sublabel: sh.address,
      icon: shelterIcon,
      popup: (
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
              href={appendOutboundUtm(
                `https://www.google.com/maps/dir/?api=1&destination=${sh.lat},${sh.lng}`,
                { medium: "map_navigation", campaign: "map_directions" },
              )}
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
          <PopupNearbyToolsLinks lat={sh.lat} lng={sh.lng} />
        </div>
      ),
    }));

    return [...sensorMarkers, ...shelterMarkers];
  }, [validSensors, validShelters]);

  return (
    <BaseMap
      markers={markers}
      zoom={zoom}
      userLocation={
        userLocation ? { lat: userLocation.lat, lng: userLocation.lng, isDefault: userLocation.isDefault } : undefined
      }
    />
  );
}
