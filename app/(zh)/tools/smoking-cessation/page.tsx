import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";
import SmokingAwarenessContent from "./SmokingAwarenessContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/smoking-cessation`;
const catalogEntry = getToolCatalogEntry("smoking-cessation");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["戒菸門診", "二代戒菸", "戒菸補助", "戒菸藥局", "戒菸衛教", "國健署戒菸特約"],
  alternates: { canonical },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function SmokingCessationPage() {
  return (
    <ToolPageShell slug="smoking-cessation" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["smoking-cessation"]} />
      {/* issue #573: 新興菸品法規、喪屍煙彈、合法加熱菸清單、檳榔與口腔癌 —
          4 個靜態宣導區塊，與上面的戒菸院所查詢是獨立的靜態內容。 */}
      <SmokingAwarenessContent />
    </ToolPageShell>
  );
}
