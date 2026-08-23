import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/hakka-bogong`;
const catalogEntry = getToolCatalogEntry("hakka-bogong");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["伯公照護站", "客家委員會", "長照2.0", "客庄長者照護", "社區照顧關懷據點"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "客家委員會「伯公照護站」查詢", description: "查詢全台客家委員會伯公照護站名冊。", url: canonical },
};

export default function HakkaBogongPage() {
  return (
    <ToolPageShell slug="hakka-bogong" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["hakka-bogong"]} />
    </ToolPageShell>
  );
}
