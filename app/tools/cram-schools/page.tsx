import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/cram-schools`;
const catalogEntry = getToolCatalogEntry("cram-schools");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["補習班", "短期補習班", "升學文理", "外語補習班", "技藝補習班", "立案查詢", "教育部"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "全國短期補習班查詢", description: "查詢全國 22 縣市立案短期補習班名冊與地址。", url: canonical },
};

export default function CramSchoolsPage() {
  return (
    <ToolPageShell slug="cram-schools" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["cram-schools"]} />
    </ToolPageShell>
  );
}
