"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

import MapViewController, { userLocationIcon } from "@/components/Common/MapViewController";
import { clusterMarkers } from "@/components/Map/clusterMarkers";
import {
  FALLBACK_ATTRIBUTION,
  FALLBACK_TILE_URL,
  FALLBACK_TILE_Z_INDEX,
  PRIMARY_ATTRIBUTION,
  PRIMARY_TILE_ERROR_THRESHOLD,
  PRIMARY_TILE_URL,
  PRIMARY_TILE_Z_INDEX,
} from "@/components/Map/tileConfig";

// Webpack/Turbopack breaks Leaflet's default marker icon URL resolution — point it at a CDN
// instead (same fix repeated in every existing Leaflet map component in this codebase).
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/** 找不到任何可用的中心點時的退回位置：臺北101（和既有地圖元件的慣例一致）。 */
export const DEFAULT_CENTER: [number, number] = [25.033, 121.5654];
export const DEFAULT_ZOOM = 13;

export interface BaseMapMarker {
  id: string;
  lat: number;
  lng: number;
  /** 點擊標記後彈出視窗要顯示的內容；不提供則點擊沒有反應。 */
  popup?: ReactNode;
  /** 清單檢視要顯示的標題，預設退回 id。 */
  label?: string;
  /** 清單檢視的標題下方的次要說明文字（例如地址）。 */
  sublabel?: string;
}

export interface BaseMapUserLocation {
  lat: number;
  lng: number;
  /** true 代表這是定位失敗後的預設位置，不是使用者的真實位置。 */
  isDefault?: boolean;
  /** 提供時才會顯示懸浮定位按鈕。 */
  refresh?: () => void;
  refreshing?: boolean;
}

export interface BaseMapProps {
  /** 要渲染的標記點位；相近的點位會依目前縮放層級自動群聚。 */
  markers: BaseMapMarker[];
  /** 初始中心點；未提供時依序退回 userLocation → 第一個標記點 → DEFAULT_CENTER。只在掛載時套用一次。 */
  center?: [number, number];
  zoom?: number;
  userLocation?: BaseMapUserLocation;
  /** 外層容器的額外 class（例如控制高度）；元件本身只保證填滿容器的寬高。 */
  className?: string;
  /** 是否顯示內建的「清單／地圖」切換，預設顯示。 */
  showViewToggle?: boolean;
  /** 清單檢視在沒有任何標記點時顯示的文字。 */
  emptyListMessage?: string;
  /** 群聚半徑（螢幕像素），預設 60px。 */
  clusterRadiusPx?: number;
  /** 達到此縮放層級後不再群聚，各點各自顯示，預設 17。 */
  disableClusteringAtZoom?: number;
}

function buildClusterIcon(count: number): L.DivIcon {
  const size = count >= 100 ? 44 : count >= 10 ? 38 : 32;
  return new L.DivIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#4f46e5;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${count >= 100 ? 12 : 13}px;">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

interface ClusteredMarkersProps {
  markers: BaseMapMarker[];
  clusterRadiusPx?: number;
  disableClusteringAtZoom?: number;
}

/** 掛載在 MapContainer 內部的群聚渲染層；用 zoomend 事件追蹤縮放層級變化並重新分群。 */
function ClusteredMarkers({ markers, clusterRadiusPx, disableClusteringAtZoom }: ClusteredMarkersProps) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  const clusters = useMemo(
    () => clusterMarkers(markers, zoom, { radiusPx: clusterRadiusPx, disableClusteringAtZoom }),
    [markers, zoom, clusterRadiusPx, disableClusteringAtZoom],
  );

  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.count > 1) {
          const key = `cluster-${cluster.members.map((m) => m.id).join(",")}`;
          return (
            <Marker
              key={key}
              position={[cluster.lat, cluster.lng]}
              icon={buildClusterIcon(cluster.count)}
              eventHandlers={{
                click: () => map.setView([cluster.lat, cluster.lng], Math.min(map.getZoom() + 2, 18)),
              }}
            />
          );
        }

        const marker = cluster.members[0];
        return (
          <Marker key={marker.id} position={[marker.lat, marker.lng]}>
            {marker.popup && <Popup>{marker.popup}</Popup>}
          </Marker>
        );
      })}
    </>
  );
}

/**
 * 共用地圖元件（issue #475）。把全站 9 個地圖各自重複實作的邏輯——底圖、備援
 * 底圖、定位按鈕、點位群聚、清單／地圖切換、底圖授權標示——統一實作一次。
 * 呼叫端只需要提供標記點位與彈出視窗內容。
 *
 * 這張票刻意不接上任何現有頁面（見 #476），所以這裡示範的是元件本身的用法：
 *
 * ```tsx
 * import dynamic from "next/dynamic";
 * const BaseMap = dynamic(() => import("@/components/Map/BaseMap"), { ssr: false });
 *
 * <div className="h-[480px]">
 *   <BaseMap
 *     markers={stations.map((s) => ({
 *       id: String(s.id),
 *       lat: s.lat,
 *       lng: s.lng,
 *       label: s.name,
 *       sublabel: s.address,
 *       popup: <div>{s.name}</div>,
 *     }))}
 *     userLocation={geo}
 *   />
 * </div>
 * ```
 *
 * SSR 不安全（讀取 window／Leaflet DOM），需以 `dynamic(..., { ssr: false })` 載入，
 * 和既有 9 個地圖元件的慣例一致。
 */
export default function BaseMap({
  markers,
  center,
  zoom = DEFAULT_ZOOM,
  userLocation,
  className = "",
  showViewToggle = true,
  emptyListMessage = "目前沒有標記點位",
  clusterRadiusPx,
  disableClusteringAtZoom,
}: BaseMapProps) {
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [focusedCenter, setFocusedCenter] = useState<[number, number] | null>(null);
  const [focusedZoom, setFocusedZoom] = useState<number | null>(null);
  const [primaryTileFailed, setPrimaryTileFailed] = useState(false);
  const primaryErrorCount = useRef(0);

  // 初始中心點只在掛載時決定一次，之後地圖重新渲染（markers／userLocation 內容變動）
  // 不會把使用者正在查看的視角拉走；真正要「飛到」某個位置時走 focusedCenter。
  const initialCenter = useMemo<[number, number]>(() => {
    if (center) return center;
    if (userLocation) return [userLocation.lat, userLocation.lng];
    const first = markers.find((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng));
    if (first) return [first.lat, first.lng];
    return DEFAULT_CENTER;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapCenter: [number, number] = focusedCenter ?? (userLocation ? [userLocation.lat, userLocation.lng] : initialCenter);
  const mapZoom = focusedZoom ?? zoom;

  const handleRefresh = () => {
    setFocusedCenter(null);
    setFocusedZoom(null);
    userLocation?.refresh?.();
  };

  const focusOnMarker = (marker: BaseMapMarker) => {
    setFocusedCenter([marker.lat, marker.lng]);
    setFocusedZoom(Math.max(zoom, 16));
    setViewMode("map");
  };

  return (
    <div className={`relative h-full w-full ${className}`}>
      {showViewToggle && (
        <div className="absolute top-3 left-3 z-[1000] flex gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
          <button
            type="button"
            onClick={() => setViewMode("map")}
            aria-pressed={viewMode === "map"}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              viewMode === "map"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            🗺️ 地圖
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              viewMode === "list"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            📋 清單
          </button>
        </div>
      )}

      {userLocation?.refresh && (
        <div className="absolute top-3 right-3 z-[1000]">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={userLocation.refreshing}
            title="重新定位至我的位置"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-md transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {userLocation.refreshing ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            ) : (
              <span className="text-base">🎯</span>
            )}
          </button>
        </div>
      )}

      {viewMode === "map" ? (
        <MapContainer center={mapCenter} zoom={mapZoom} className="h-full w-full" scrollWheelZoom>
          <MapViewController center={mapCenter} zoom={mapZoom} />

          {/* 備援底圖永遠掛載在下層；主要底圖失敗時把它的 opacity 降為 0，
              使用者立刻看到已經在背後載入好的備援底圖，不會有空白地圖的瞬間。 */}
          <TileLayer url={FALLBACK_TILE_URL} attribution={FALLBACK_ATTRIBUTION} zIndex={FALLBACK_TILE_Z_INDEX} />
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

          {userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng) && (
            <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon}>
              <Popup>{userLocation.isDefault ? "預設位置" : "您目前的位置"}</Popup>
            </Marker>
          )}

          <ClusteredMarkers markers={markers} clusterRadiusPx={clusterRadiusPx} disableClusteringAtZoom={disableClusteringAtZoom} />
        </MapContainer>
      ) : (
        <div className="h-full w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 pt-14 dark:border-slate-800 dark:bg-slate-900">
          {markers.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{emptyListMessage}</p>
          ) : (
            <ul className="space-y-2">
              {markers.map((marker) => (
                <li key={marker.id}>
                  <button
                    type="button"
                    onClick={() => focusOnMarker(marker)}
                    className="w-full rounded-lg border border-slate-100 p-3 text-left text-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                  >
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{marker.label ?? marker.id}</p>
                    {marker.sublabel && <p className="text-xs text-slate-500 dark:text-slate-400">{marker.sublabel}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
