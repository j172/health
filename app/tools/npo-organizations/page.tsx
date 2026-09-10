import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import NpoOrganizationsContent from "./NpoOrganizationsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/npo-organizations`;
const catalogEntry = getToolCatalogEntry("npo-organizations");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "公益組織",
    "NPO",
    "非營利組織",
    "社會福利",
    "財團法人",
    "公益協會",
    "統一編號",
    "公益資訊中心",
    "社福機構查詢",
  ],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function NpoOrganizationsPage() {
  return (
    <ToolPageShell slug="npo-organizations" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <NpoOrganizationsContent />
    </ToolPageShell>
  );
}
