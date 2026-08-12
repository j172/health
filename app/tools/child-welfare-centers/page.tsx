import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/child-welfare-centers`;
const catalogEntry = getToolCatalogEntry("child-welfare-centers");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["兒少福利中心", "兒童及少年福利服務中心", "兒少服務", "個案輔導", "衛福部"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "兒少福利中心查詢", description: "查詢全國兒童及少年福利服務中心一覽表。", url: canonical },
};

export default function ChildWelfareCentersPage() {
  return (
    <ToolPageShell slug="child-welfare-centers" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["child-welfare-centers"]} />
    </ToolPageShell>
  );
}
