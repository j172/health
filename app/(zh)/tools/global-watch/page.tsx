import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import GlobeWatchClient from "@/components/Tools/GlobeWatch/GlobeWatchClient";
import GlobeWatchItemNav from "@/components/Tools/GlobeWatch/GlobeWatchItemNav";

// Issue #587 (parent #583): globe-shell-only first ticket. StabloHeader
// (rendered inside ToolPageShell) carries a live DB-backed weather-alert
// bar, same reason every other /tools/<slug> page can't be statically
// prerendered — see app/(zh)/tools/bmi/page.tsx's identical comment.
export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/global-watch`;
const catalogEntry = getToolCatalogEntry("global-watch");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["全球動態地球", "3D地球", "地球儀", "MapLibre", "全球地圖"],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function GlobalWatchPage() {
  return (
    <ToolPageShell slug="global-watch" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      {/* Issue #589 (parent #583): the item switcher first appears here so a
          visitor landing on the bare shell can reach the 國際疫情 item —
          see GlobeWatchItemNav's own doc comment for why this list has
          exactly one entry today. */}
      <GlobeWatchItemNav />

      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        拖曳可旋轉地球、滾動可縮放；拉近到城市層級時會自然轉為平面街道地圖。右上角可切換向量地圖與衛星影像，或一鍵回到台灣預設視角。
        目前僅提供地球本身的瀏覽功能與「國際疫情」項目，颱風、全球災害與全球空品等資料圖層將於後續版本陸續上線。
      </p>

      <GlobeWatchClient />

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        向量地圖來源：
        <a
          href={appendOutboundUtm("https://www.openfreemap.org/", { medium: "attribution", campaign: "global_watch_page" })}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          OpenFreeMap
        </a>
        （OpenMapTiles／OpenStreetMap）。
        衛星影像來源：
        <a
          href={appendOutboundUtm("https://www.earthdata.nasa.gov/data/tools/gibs", { medium: "attribution", campaign: "global_watch_page" })}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          NASA EOSDIS GIBS
        </a>
        （Blue Marble，公有領域影像）。
        地球引擎：
        <a
          href={appendOutboundUtm("https://maplibre.org/", { medium: "attribution", campaign: "global_watch_page" })}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          MapLibre GL JS
        </a>
        。
      </p>
    </ToolPageShell>
  );
}
