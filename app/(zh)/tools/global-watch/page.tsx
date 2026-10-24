import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import GlobeWatchClient from "@/components/Tools/GlobeWatch/GlobeWatchClient";
import GlobeWatchItemTabs from "@/components/Tools/GlobeWatch/GlobeWatchItemTabs";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";

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
      {/* Issue #588/#589 (parent #583): the shared item-switcher tab bar
          (lib/tools/globeWatch/items.ts's GLOBE_WATCH_ITEMS, rendered by
          GlobeWatchItemTabs) so a visitor landing on the bare shell can
          reach either item. */}
      <GlobeWatchItemTabs />

      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        拖曳可旋轉地球、滾動可縮放；拉近到城市層級時會自然轉為平面街道地圖。右上角可切換向量地圖與衛星影像，或一鍵回到台灣預設視角。
        目前僅提供地球本身的瀏覽功能與「國際疫情」項目，颱風、全球災害與全球空品等資料圖層將於後續版本陸續上線。
      </p>

      <ContextualPartnerCard
        partnerId="msf-taiwan"
        contextTitle="全球前線緊急醫療與人道救援"
        contextDescription="全球重大天災人禍與突發公共衛生危機應變：在關注國際疫情與重大災害圖資時，前往無國界醫生（台灣）了解第一線戰地醫療專案與國際急難救助行動。"
      />

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
