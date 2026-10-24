"use client";

import "leaflet/dist/leaflet.css";
import React, { useMemo, useRef, useState, useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Polygon, Marker, Popup } from "react-leaflet";
import type { PowerOutageIncident } from "@/lib/server/power/outageParser";
import MapViewController, { userLocationIcon } from "@/components/Common/MapViewController";
import {
  FALLBACK_ATTRIBUTION,
  FALLBACK_TILE_URL,
  FALLBACK_TILE_Z_INDEX,
  PRIMARY_ATTRIBUTION,
  PRIMARY_TILE_ERROR_THRESHOLD,
  PRIMARY_TILE_URL,
  PRIMARY_TILE_Z_INDEX,
} from "@/components/Map/tileConfig";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const DEFAULT_CENTER: [number, number] = [23.9738, 120.982]; // Center of Taiwan
const DEFAULT_ZOOM = 8;

export interface PowerOutagesMapProps {
  incidents: PowerOutageIncident[];
  userLocation?: { lat: number; lng: number };
  focusCoord?: [number, number] | null;
  className?: string;
}

function computeCentroid(coords: [number, number][]): [number, number] | null {
  if (!coords || coords.length === 0) return null;
  let sumLat = 0;
  let sumLng = 0;
  let validCount = 0;
  for (const [lng, lat] of coords) {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      sumLat += lat;
      sumLng += lng;
      validCount++;
    }
  }
  if (validCount === 0) return null;
  return [sumLat / validCount, sumLng / validCount];
}

const makeOutageBadgeIcon = (count: number) => {
  const bg = count > 500 ? "#dc2626" : "#d97706";
  const displayCount = count > 999 ? `${(count / 1000).toFixed(1)}k` : `${count}`;
  return new L.DivIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;gap:1px;min-width:28px;height:24px;padding:0 5px;border-radius:12px;background:${bg};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);color:#fff;font-size:11px;font-weight:700;"><span>⚡</span><span>${displayCount}</span></div>`,
    iconSize: [36, 24],
    iconAnchor: [18, 12],
    popupAnchor: [0, -12],
  });
};

export default function PowerOutagesMap({
  incidents,
  userLocation,
  focusCoord,
  className = "h-[450px] sm:h-[550px] w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800",
}: PowerOutagesMapProps) {
  const [primaryTileFailed, setPrimaryTileFailed] = useState(false);
  const primaryErrorCount = useRef(0);

  const initialCenter = useMemo<[number, number]>(() => {
    if (focusCoord) return focusCoord;
    if (userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng)) {
      return [userLocation.lat, userLocation.lng];
    }
    // If incidents exist, center on the first incident with coordinates
    for (const inc of incidents) {
      const c = computeCentroid(inc.coordinates);
      if (c) return c;
    }
    return DEFAULT_CENTER;
  }, [focusCoord, userLocation, incidents]);

  const [center, setCenter] = useState<[number, number]>(initialCenter);
  const [zoom, setZoom] = useState<number>(focusCoord ? 14 : incidents.length > 0 ? 9 : DEFAULT_ZOOM);

  useEffect(() => {
    if (focusCoord) {
      setCenter(focusCoord);
      setZoom(14);
    }
  }, [focusCoord]);

  const incidentPolygons = useMemo(() => {
    return incidents.map((inc) => {
      const positions: [number, number][] = inc.coordinates.map(([lng, lat]) => [lat, lng]);
      const centroid = computeCentroid(inc.coordinates);
      return {
        incident: inc,
        positions,
        centroid,
      };
    });
  }, [incidents]);

  return (
    <div className={`relative ${className}`}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <MapViewController center={center} zoom={zoom} />

        {/* Fallback tile layer underneath */}
        <TileLayer
          url={FALLBACK_TILE_URL}
          attribution={FALLBACK_ATTRIBUTION}
          zIndex={FALLBACK_TILE_Z_INDEX}
        />
        {/* Primary NLSC EMAP5 TileLayer */}
        <TileLayer
          url={PRIMARY_TILE_URL}
          attribution={PRIMARY_ATTRIBUTION}
          zIndex={PRIMARY_TILE_Z_INDEX}
          opacity={primaryTileFailed ? 0 : 1}
          eventHandlers={{
            tileerror: () => {
              primaryErrorCount.current += 1;
              if (primaryErrorCount.current >= PRIMARY_TILE_ERROR_THRESHOLD) {
                setPrimaryTileFailed(true);
              }
            },
            tileload: () => {
              primaryErrorCount.current = 0;
            },
          }}
        />

        {/* User location marker */}
        {userLocation &&
          Number.isFinite(userLocation.lat) &&
          Number.isFinite(userLocation.lng) && (
            <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon}>
              <Popup>
                <div className="text-xs font-semibold text-slate-800">您目前的位置</div>
              </Popup>
            </Marker>
          )}

        {/* Village Polygons & Centroid Badges */}
        {incidentPolygons.map(({ incident, positions, centroid }) => {
          const isSevere = incident.outageCount >= 500;
          return (
            <React.Fragment key={incident.id}>
              {positions.length >= 3 && (
                <Polygon
                  positions={positions}
                  pathOptions={{
                    color: isSevere ? "#dc2626" : "#ea580c",
                    fillColor: isSevere ? "#ef4444" : "#f97316",
                    fillOpacity: 0.38,
                    weight: 2.5,
                  }}
                >
                  <Popup>
                    <div className="p-1 min-w-[200px]">
                      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1.5 dark:border-slate-700">
                        <span className="text-base">⚡</span>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {incident.county}{incident.township}
                          </div>
                          <div className="text-xs font-medium text-red-600">
                            {incident.village}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-700">
                        <div className="flex justify-between">
                          <span className="text-slate-500">影響戶數：</span>
                          <span className="font-bold text-red-600">
                            {incident.outageCount.toLocaleString()} 戶
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">預計復電：</span>
                          <span className="font-medium text-amber-700">
                            {incident.restoreTime ?? "查修中 (暫無時間)"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">更新時間：</span>
                          <span className="text-slate-600">{incident.updateTime}</span>
                        </div>
                      </div>
                      <div className="mt-3">
                        <a
                          href={`tel:${incident.contactPhone || "1911"}`}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 active:scale-95 transition-all"
                        >
                          📞 撥打 {incident.contactPhone || "1911"} 台電專線
                        </a>
                      </div>
                    </div>
                  </Popup>
                </Polygon>
              )}

              {centroid && (
                <Marker
                  position={centroid}
                  icon={makeOutageBadgeIcon(incident.outageCount)}
                >
                  <Popup>
                    <div className="p-1 min-w-[200px]">
                      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1.5 dark:border-slate-700">
                        <span className="text-base">⚡</span>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {incident.county}{incident.township}
                          </div>
                          <div className="text-xs font-medium text-red-600">
                            {incident.village}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-700">
                        <div className="flex justify-between">
                          <span className="text-slate-500">影響戶數：</span>
                          <span className="font-bold text-red-600">
                            {incident.outageCount.toLocaleString()} 戶
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">預計復電：</span>
                          <span className="font-medium text-amber-700">
                            {incident.restoreTime ?? "查修中 (暫無時間)"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">更新時間：</span>
                          <span className="text-slate-600">{incident.updateTime}</span>
                        </div>
                      </div>
                      <div className="mt-3">
                        <a
                          href={`tel:${incident.contactPhone || "1911"}`}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 active:scale-95 transition-all"
                        >
                          📞 撥打 {incident.contactPhone || "1911"} 台電專線
                        </a>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )}
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
