import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import AntiFraudChecker from "./AntiFraudChecker";

// StabloHeader renders a live DB-backed weather-alert bar (same as /news),
// so this page can't be statically prerendered at build time either.
export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/anti-fraud`;
const catalogEntry = getToolCatalogEntry("anti-fraud");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: catalogEntry.keywords,
  alternates: { canonical },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function AntiFraudPage() {
  return (
    <ToolPageShell slug="anti-fraud" title={catalogEntry.title}>
      <AntiFraudChecker />
    </ToolPageShell>
  );
}
