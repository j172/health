import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import GlobeWatchItemNav from "@/components/Tools/GlobeWatch/GlobeWatchItemNav";
import GlobeWatchEpidemicsClient from "@/components/Tools/GlobeWatch/GlobeWatchEpidemicsClient";
import TravelEpidemicAlertsContent from "@/components/Epidemic/TravelEpidemicAlertsContent";

// Issue #589 (parent #583): the 國際疫情 item under the global-watch globe
// shell #587 shipped. Reuses the "global-watch" TOOL_CATALOG entry for
// ToolPageShell's shared chrome (breadcrumb/related-tools/disclaimer), same
// as the root /tools/global-watch page (#587) — but this page's own
// `metadata` export below is independent (AC: 各自有獨立 SEO metadata), not
// a copy of the shell's.
export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/global-watch/epidemics`;
const catalogEntry = getToolCatalogEntry("global-watch");

export const metadata: Metadata = {
  title: "國際疫情地圖｜疾管署旅遊疫情等級 - 全球動態地球",
  description:
    "依疾管署旅遊疫情建議等級為各國上色（第一級注意／第二級警示／第三級警告），點擊國家查看所有疾病、建議與疾管署連結；並提供疾病快搜、分頁與國際重要疫情快訊（含登革熱）。",
  keywords: ["國際疫情", "旅遊疫情", "出國疫情", "旅遊警示", "境外感染", "登革熱", "疾管署"],
  alternates: { canonical },
  openGraph: {
    title: "國際疫情地圖 - 全球動態地球",
    description: "疾管署旅遊疫情建議等級地圖視覺化、疾病快搜與國際重要疫情快訊。",
    url: canonical,
  },
};

export default function GlobalWatchEpidemicsPage() {
  return (
    <ToolPageShell slug="global-watch" title={catalogEntry.title + "｜國際疫情"} maxWidthClassName="max-w-5xl">
      <GlobeWatchItemNav />

      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        依疾病管制署「國際間旅遊疫情建議等級」資料，將各國依最高等級上色：
        🟡 第一級注意、🟠 第二級警示、🔴 第三級警告。點擊地球上的國家可以看到該國目前所有疾病、等級、建議事項與疾管署連結；
        下方同時提供疾病關鍵字搜尋、分頁與國際重要疫情快訊（含登革熱等關鍵字）。
      </p>

      <GlobeWatchEpidemicsClient />

      <div className="mt-8">
        <TravelEpidemicAlertsContent />
      </div>
    </ToolPageShell>
  );
}
