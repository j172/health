import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import ContraceptionMapContent from "@/components/ContraceptionMap/ContraceptionMapContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/contraception-map`;
const catalogEntry = getToolCatalogEntry("contraception-map");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "避孕諮詢",
    "避孕諮詢藥局",
    "避孕門診",
    "婦產科診所",
    "事前避孕藥",
    "事後避孕藥",
    "雙重避孕法",
    "台灣婦產科醫學會",
    "BeOK",
  ],
  alternates: { canonical },
  robots: { index: false },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function ContraceptionMapPage() {
  return (
    <ToolPageShell slug="contraception-map" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <ContraceptionMapContent />
    </ToolPageShell>
  );
}
