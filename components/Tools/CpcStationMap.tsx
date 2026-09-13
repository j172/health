"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useMemo } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import MapViewController, { userLocationIcon } from "@/components/Common/MapViewController";
import type { CpcStationItem } from "@/lib/server/cpc/stations";

// Webpack/Turbopack default marker fix
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface CpcStationMapProps {
  stations: CpcStationItem[];
  userLocation: { lat: number; lng: number; isDefault: boolean };
  selectedStationId?: number | null;
  onSelectStation?: (station: CpcStationItem) => void;
}

export default function CpcStationMap({
  stations,
  userLocation,
  selectedStationId,
  onSelectStation,
}: CpcStationMapProps) {
  const center: [number, number] = useMemo(() => {
    if (selectedStationId) {
      const target = stations.find((s) => s.id === selectedStationId);
      if (target && target.lat && target.lng) {
        return [target.lat, target.lng];
      }
    }
    return [userLocation.lat, userLocation.lng];
  }, [selectedStationId, stations, userLocation]);

  return (
    <div className="relative h-[480px] w-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800">
      <MapContainer
        center={center}
        zoom={13}
        className="h-full w-full z-0"
        scrollWheelZoom={true}
      >
        <MapViewController center={center} zoom={13} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* User Location */}
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon}>
          <Popup>
            <div className="text-xs font-semibold">
              {userLocation.isDefault ? "📍 預設位置（台北）" : "📍 您目前的位置"}
            </div>
          </Popup>
        </Marker>

        {/* Stations */}
        {stations.map((station) => {
          if (!station.lat || !station.lng) return null;
          const isSelected = selectedStationId === station.id;

          return (
            <Marker
              key={station.id}
              position={[station.lat, station.lng]}
              eventHandlers={{
                click: () => onSelectStation?.(station),
              }}
            >
              <Popup>
                <div className="max-w-[260px] text-xs leading-relaxed space-y-1.5 p-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-blue-800 dark:text-blue-600">
                      {station.name}
                    </span>
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-mono text-blue-800">
                      {station.extra_json?.stationCode}
                    </span>
                  </div>

                  {station.address && (
                    <div className="text-slate-600">
                      📍 {station.address}
                    </div>
                  )}

                  {station.phone && (
                    <div className="text-slate-600">
                      📞 <a href={`tel:${station.phone}`} className="text-blue-600 hover:underline">{station.phone}</a>
                    </div>
                  )}

                  {station.distance_km !== undefined && (
                    <div className="text-[11px] font-semibold text-emerald-600">
                      距離約 {station.distance_km.toFixed(1)} 公里
                    </div>
                  )}

                  {/* Services tags */}
                  {station.extra_json?.services && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {station.extra_json.services.map((svc) => (
                        <span
                          key={svc}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                        >
                          {svc}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 pt-1 border-t border-slate-100 flex justify-between items-center">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                        station.address || `${station.lat},${station.lng}`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline"
                    >
                      開啟 Google 導航 ↗
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
