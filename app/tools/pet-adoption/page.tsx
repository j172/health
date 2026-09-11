import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import PetAdoptionContent from "@/components/PetAdoption/PetAdoptionContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/pet-adoption`;
const catalogEntry = getToolCatalogEntry("pet-adoption");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["動物認領養", "流浪動物", "公立收容所", "領養代替購買", "狗狗領養", "貓咪領養", "農業部開放資料"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function PetAdoptionPage() {
  return (
    <ToolPageShell slug="pet-adoption" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <PetAdoptionContent />
    </ToolPageShell>
  );
}
