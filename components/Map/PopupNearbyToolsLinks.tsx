"use client";

export interface PopupNearbyToolsLinksProps {
  lat: number | null | undefined;
  lng: number | null | undefined;
  /** Extra className merged onto the wrapping row, e.g. to match a specific popup's spacing. */
  className?: string;
}

const NEARBY_TOOL_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/tools/aed", label: "⚡ 附近 AED" },
  { href: "/tools/er-status", label: "🚑 附近急診" },
  { href: "/tools/pharmacies", label: "💊 附近藥局" },
];

/**
 * 全站地圖彈出視窗共用的「看附近的 AED／急診／藥局」深連結區塊（issue #463，
 * 母票 #438 §E）。帶著這個點位自己的座標開啟對應工具頁的 `?lat=&lng=`，讓目的頁
 * 以這個點位（而不是使用者目前的裝置定位）為中心顯示結果，不需要使用者重新定位
 * ——見 components/Facilities/useGeolocation.ts 新增的 override 參數，以及
 * app/tools/aed、er-status、pharmacies 讀取這兩個查詢參數的 Suspense 包裝。
 *
 * 刻意獨立成單一元件讓全站每個 Leaflet 地圖的 Popup 都 import 同一份，而不是
 * 像既有的 Google 地圖導航連結那樣在每個地圖檔案裡各自重複貼上一份
 * JSX（acceptance criteria 第三條：「這個功能加在目前全站共用的地圖彈出視窗
 * 元件上，不是各地圖各自實作一份」）。
 *
 * 座標無效（null/undefined/NaN）時整個區塊不渲染，不會產生壞掉的連結。
 */
export default function PopupNearbyToolsLinks({ lat, lng, className = "" }: PopupNearbyToolsLinksProps) {
  const numLat = typeof lat === "number" ? lat : NaN;
  const numLng = typeof lng === "number" ? lng : NaN;
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) return null;

  const query = `?lat=${numLat}&lng=${numLng}`;

  return (
    <div className={`mt-1.5 flex flex-wrap gap-1 border-t border-neutral-100 pt-1.5 dark:border-slate-700 ${className}`}>
      {NEARBY_TOOL_LINKS.map((tool) => (
        <a
          key={tool.href}
          href={`${tool.href}${query}`}
          className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {tool.label}
        </a>
      ))}
    </div>
  );
}
