/**
 * 點位群聚的純函式實作（issue #475）。
 *
 * 刻意不引入 leaflet.markercluster / react-leaflet-cluster 之類的套件——2.0
 * 的方向是降低 runtime 相依數量（見 docs/2.0/master-plan.md §L），而這裡需要
 * 的分群邏輯並不複雜：用標準 Web Mercator 像素投影（跟 Leaflet 內部一致的公式）
 * 把每個標記點依目前縮放層級投影成螢幕像素座標，再用簡單的貪婪演算法把距離
 * 在門檻內的點收進同一群。不依賴 Leaflet 的 map 實例，純數學運算，可在
 * node:test 下直接單元測試，不需要 DOM。
 */

export interface ClusterableMarker {
  id: string;
  lat: number;
  lng: number;
}

export interface MarkerCluster<T extends ClusterableMarker = ClusterableMarker> {
  /** 群心（所有成員像素座標的平均，反投影回經緯度） */
  lat: number;
  lng: number;
  /** 群內成員，count === 1 時代表這是單一標記點，不是真正的群聚 */
  members: T[];
  count: number;
}

const TILE_SIZE = 256;

/** 標準 Web Mercator 球面投影，和 Leaflet 的 EPSG:3857 CRS 公式一致。 */
function project(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function unproject(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

export interface ClusterMarkersOptions {
  /** 群聚半徑（螢幕像素），預設 60px——大致是 Leaflet 預設群聚套件常用的數值 */
  radiusPx?: number;
  /** 達到或超過此縮放層級時完全不群聚，所有點各自顯示（貼近使用者放大後想看單點的直覺） */
  disableClusteringAtZoom?: number;
}

const DEFAULT_RADIUS_PX = 60;
const DEFAULT_DISABLE_CLUSTERING_AT_ZOOM = 17;

/**
 * 依目前縮放層級把標記點分群。
 * - zoom 越小（看得越遠），同樣像素半徑覆蓋的實際地理範圍越大，自然群聚得越多。
 * - 回傳順序穩定（依輸入順序的群聚起點），方便測試斷言。
 * - 經緯度或座標非有限數值的點會被忽略（不拋錯，呼叫端通常來自後端資料，容許髒資料）。
 */
export function clusterMarkers<T extends ClusterableMarker>(markers: T[], zoom: number, options: ClusterMarkersOptions = {}): MarkerCluster<T>[] {
  const radiusPx = options.radiusPx ?? DEFAULT_RADIUS_PX;
  const disableClusteringAtZoom = options.disableClusteringAtZoom ?? DEFAULT_DISABLE_CLUSTERING_AT_ZOOM;

  const valid = markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng));

  if (zoom >= disableClusteringAtZoom) {
    return valid.map((m) => ({ lat: m.lat, lng: m.lng, members: [m], count: 1 }));
  }

  const projected = valid.map((m) => ({ marker: m, ...project(m.lat, m.lng, zoom) }));
  const used = new Array(projected.length).fill(false);
  const clusters: MarkerCluster<T>[] = [];

  for (let i = 0; i < projected.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const group = [projected[i]];

    for (let j = i + 1; j < projected.length; j++) {
      if (used[j]) continue;
      const dx = projected[i].x - projected[j].x;
      const dy = projected[i].y - projected[j].y;
      if (Math.sqrt(dx * dx + dy * dy) <= radiusPx) {
        used[j] = true;
        group.push(projected[j]);
      }
    }

    const avgX = group.reduce((sum, p) => sum + p.x, 0) / group.length;
    const avgY = group.reduce((sum, p) => sum + p.y, 0) / group.length;
    const center = unproject(avgX, avgY, zoom);

    clusters.push({
      lat: center.lat,
      lng: center.lng,
      members: group.map((p) => p.marker),
      count: group.length,
    });
  }

  return clusters;
}
