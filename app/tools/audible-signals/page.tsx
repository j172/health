import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/audible-signals`;
const catalogEntry = getToolCatalogEntry("audible-signals");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["盲人有聲號誌", "行人穿越道語音號誌", "視障", "App觸發"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "全國盲人有聲號誌查詢", description: "查詢全國盲人有聲號誌設置路口與是否支援App觸發。", url: canonical },
};

export default function AudibleSignalsPage() {
  return (
    <ToolPageShell slug="audible-signals" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["audible-signals"]} />
    </ToolPageShell>
  );
}
