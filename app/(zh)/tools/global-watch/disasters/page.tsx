import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import { getCurrentGdacsDisasterEvents } from "@/lib/server/gdacs/queries";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import GlobeWatchDisastersItem from "@/components/Tools/GlobeWatch/GlobeWatchDisastersItem";

// Issue #594 (parent #583): the "全球災害" item under the global-watch globe
// shell (#587) / GDACS pipeline (#592). Same ToolPageShell-reusing pattern
// as app/(zh)/tools/global-watch/epidemics/page.tsx (#589) — shared
// breadcrumb/related-tools chrome from the "global-watch" TOOL_CATALOG
// entry, but this page's own `metadata` export is independent (AC: 各自有
// 獨立 SEO metadata).
export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/global-watch/disasters`;
const catalogEntry = getToolCatalogEntry("global-watch");

export const metadata: Metadata = {
  title: "全球災害地圖｜GDACS 洪水・火山・乾旱・野火即時事件 - 全球動態地球",
  description:
    "依 GDACS（全球災害預警協調系統）資料顯示全球目前的洪水、火山、乾旱、野火事件，依紅／橙／綠警戒等級上色，可勾選要顯示的災種；國名、災種、警戒等級已中文化，標題與內文保留英文原文並附閱讀原文連結。",
  keywords: ["全球災害", "GDACS", "洪水", "火山", "乾旱", "野火", "全球動態地球", "災害地圖"],
  alternates: { canonical },
  openGraph: {
    title: "全球災害地圖 - 全球動態地球",
    description: "GDACS 全球洪水、火山、乾旱、野火事件地圖，依警戒等級上色，可勾選災種。",
    url: canonical,
  },
};

export default async function GlobalWatchDisastersPage() {
  const rows = await getCurrentGdacsDisasterEvents();

  return (
    <ToolPageShell slug="global-watch" title={catalogEntry.title + "｜全球災害"} maxWidthClassName="max-w-5xl">
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        依 GDACS（全球災害預警協調系統）資料，顯示全球目前的洪水（FL）、火山（VO）、乾旱（DR）、野火（WF）事件（地震與熱帶氣旋請見本工具的「地震」項目與颱風相關工具）。
        依紅、橙、綠警戒等級上色，可在下方勾選要顯示的災種；國名、災種、警戒等級已盡量中文化，查無對照時顯示原文。事件標題與說明保留英文原文，並附「閱讀原文」連結至 GDACS 官方報告。
      </p>

      <GlobeWatchDisastersItem rows={rows} />
    </ToolPageShell>
  );
}
