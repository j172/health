import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import OutdoorSafetyContent from "@/components/Tools/OutdoorSafetyContent";

export const revalidate = 180;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/outdoor-safety`;
const catalogEntry = getToolCatalogEntry("outdoor-safety");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "戶外運動安全指數",
    "路跑最佳時段",
    "親子放電公園推薦",
    "中暑熱指數係數",
    "紫外線防曬評估",
    "空氣品質運動指引",
    "長輩散步溫差",
    "全台戶外活動評分",
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function OutdoorSafetyPage() {
  return (
    <ToolPageShell slug="outdoor-safety" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <OutdoorSafetyContent />
    </ToolPageShell>
  );
}
