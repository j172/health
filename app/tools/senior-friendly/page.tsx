import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import SeniorFriendlyContent from "@/components/Tools/SeniorFriendlyContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/senior-friendly`;
const catalogEntry = getToolCatalogEntry("senior-friendly");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "敬老卡",
    "敬老卡補助",
    "樂齡旅遊",
    "樂齡套票",
    "無障礙景區",
    "長輩旅遊",
    "敬老愛心卡",
    "景區無障礙設施",
    "輪椅借用",
    "語音導覽",
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function SeniorFriendlyPage() {
  return (
    <ToolPageShell slug="senior-friendly" title={catalogEntry.title} maxWidthClassName="max-w-6xl">
      <SeniorFriendlyContent />
    </ToolPageShell>
  );
}
