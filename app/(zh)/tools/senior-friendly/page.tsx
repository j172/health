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
    "敬老愛心卡",
    "敬老卡申請",
    "長輩交通補助",
    "老人公車優惠",
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
