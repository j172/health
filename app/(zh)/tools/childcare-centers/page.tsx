import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import ChildcareCentersContent from "./ChildcareCentersContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/childcare-centers`;
const catalogEntry = getToolCatalogEntry("childcare-centers");

// issue #601 (parent #599): 托嬰中心與居家托育地圖，先用臺北、新北兩個縣市把
// 骨架建好——新 facilityType（childcare_center/home_childcare_center）、匯入
// 與驗證流程、臺北私立/準公共去重邏輯，供後續縣市票套用同一套模式。
export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["托嬰中心", "居家托育", "保母", "準公共", "公辦民營托嬰中心", "社區公共托育家園"],
  alternates: { canonical },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function ChildcareCentersPage() {
  return (
    <ToolPageShell slug="childcare-centers" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <ChildcareCentersContent />
    </ToolPageShell>
  );
}
