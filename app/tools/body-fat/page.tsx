import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import BodyFatCalculator from "./BodyFatCalculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/body-fat`;
const catalogEntry = getToolCatalogEntry("body-fat");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["體脂率計算", "Navy Method", "ACSM", "體脂肪"],
  alternates: { canonical },
  openGraph: { title: "體脂率計算器", description: "計算體脂率、脂肪質量與肌肉量。", url: canonical },
};

export default function BodyFatPage() {
  return (
    <ToolPageShell slug="body-fat" title={catalogEntry.title}>
      <BodyFatCalculator />
    </ToolPageShell>
  );
}
