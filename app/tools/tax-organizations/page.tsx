import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import TaxOrganizationsContent from "./TaxOrganizationsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/tax-organizations`;
const catalogEntry = getToolCatalogEntry("tax-organizations");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["非營利組織", "NPO", "統一編號", "扣繳單位", "機關團體", "財團法人", "公益協會", "管委會統編"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function TaxOrganizationsPage() {
  return (
    <ToolPageShell slug="tax-organizations" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <TaxOrganizationsContent />
    </ToolPageShell>
  );
}
