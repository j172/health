import type { Metadata } from "next";
import Link from "next/link";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import { env } from "@/lib/server/config/env";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import GlobeWatchItemTabs from "@/components/Tools/GlobeWatch/GlobeWatchItemTabs";
import GlobeWatchAirQualityClient from "@/components/Tools/GlobeWatch/GlobeWatchAirQualityClient";
import { WAQI_ATTRIBUTION_HTML } from "@/lib/tools/globeWatch/airQualityTiles";

// Issue #598 (parent #583, phase 4): the 全球空品 item under the global-watch
// globe shell #587 shipped. Reuses the "global-watch" TOOL_CATALOG entry for
// ToolPageShell's shared chrome (breadcrumb/related-tools/disclaimer), same
// as the root /tools/global-watch page (#587) and the epidemics item (#589)
// — but this page's own `metadata` export below is independent (AC: 各自有
// 獨立 SEO metadata), not a copy of the shell's.
//
// `env.waqiToken` is read here (server-side only) and passed straight down
// as a plain prop — this is the one and only place `WAQI_TOKEN` is handed
// to client code, following the same pattern
// components/Analytics/CloudflareWebAnalytics.tsx already uses for
// `CLOUDFLARE_WEB_ANALYTICS_TOKEN` (a Server Component reads the env var
// and forwards it as a prop, rather than a build-time `NEXT_PUBLIC_` var —
// this repo has no existing `NEXT_PUBLIC_`-prefixed env var at all).
export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/global-watch/air-quality`;
const catalogEntry = getToolCatalogEntry("global-watch");

export const metadata: Metadata = {
  title: "全球空品地圖｜WAQI 全球即時 AQI 圖磚 - 全球動態地球",
  description:
    "在地球上直接疊加 WAQI（World Air Quality Index Project）的全球即時 AQI 圖磚，出國前一眼掌握目的地空氣品質；提供 AQI 色階圖例與一鍵連到台灣在地「空氣品質」工具查看測站細節。",
  keywords: ["全球空品", "全球空氣品質", "WAQI", "AQI地圖", "全球動態地球", "出國空氣品質"],
  alternates: { canonical },
  openGraph: {
    title: "全球空品地圖 - 全球動態地球",
    description: "WAQI 全球即時 AQI 圖磚疊加於 3D 地球，一鍵連到台灣「空氣品質」工具。",
    url: canonical,
  },
};

export default function GlobalWatchAirQualityPage() {
  return (
    <ToolPageShell slug="global-watch" title={catalogEntry.title + "｜全球空品"} maxWidthClassName="max-w-5xl">
      <GlobeWatchItemTabs />

      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        直接疊加 WAQI（World Air Quality Index Project）提供的全球即時 AQI 圖磚（raster tile），顏色區塊依美國 EPA
        AQI 標準分級，由瀏覽器直接向 WAQI 伺服器請求，不經過本站伺服器、也不存入本站資料庫；數值僅供參考，實際測站細節請以 WAQI
        或各國官方監測單位公告為準。想查看台灣各測站的詳細即時數據，請見下方連結。
      </p>

      <GlobeWatchAirQualityClient waqiToken={env.waqiToken} />

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500" dangerouslySetInnerHTML={{ __html: `資料來源：${WAQI_ATTRIBUTION_HTML}。` }} />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-slate-700 dark:text-slate-300">
          想查詢台灣各測站的即時 PM2.5、PM10 等詳細數據？
        </p>
        <Link
          href="/tools/aqi"
          className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          前往「空氣品質」工具查看台灣測站細節 →
        </Link>
      </div>
    </ToolPageShell>
  );
}
