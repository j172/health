import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import MedicalViolatorsContent from "@/components/Tools/MedicalViolatorsContent";
import seedData from "@/data/medical-violators-seed.json";

export const revalidate = 3600;
export const runtime = "nodejs";

const slug = "medical-violators";
const canonical = `${getBaseUrl()}/tools/${slug}`;
const catalogEntry = getToolCatalogEntry(slug);

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "醫事人員性別事件資訊專區",
    "狼醫查詢",
    "性平醫事人員",
    "衛福部狼醫平台",
    "違法醫師名單",
    "就醫安全",
    "性騷擾醫師",
    "強制猥褻醫事人員",
    "醫懲會懲戒處分",
    "裁判書查詢",
    "診所安全",
    "醫療自主權",
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function MedicalViolatorsPage() {
  return (
    <ToolPageShell slug={slug} title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <MedicalViolatorsContent initialData={seedData as any} />
    </ToolPageShell>
  );
}
