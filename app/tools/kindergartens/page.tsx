import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/kindergartens`;
const catalogEntry = getToolCatalogEntry("kindergartens");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["幼兒園", "幼兒園查詢", "公立幼兒園", "私立幼兒園", "非營利幼兒園", "教育部"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "全國幼兒園查詢", description: "查詢全國公立、私立與非營利幼兒園名錄。", url: canonical },
};

export default function KindergartensPage() {
  return (
    <ToolPageShell slug="kindergartens" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["kindergartens"]} />
    </ToolPageShell>
  );
}
