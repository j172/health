import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import ChildWelfareInstitutionsContent from "./ChildWelfareInstitutionsContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/child-welfare-institutions`;
const catalogEntry = getToolCatalogEntry("child-welfare-institutions");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "全國親子館",
    "托育資源中心",
    "兒少福利中心",
    "兒童及少年福利服務中心",
    "親子館查詢",
    "個案輔導",
    "衛福部",
  ],
  alternates: { canonical },
  robots: { index: false },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function ChildWelfareInstitutionsPage() {
  return (
    <ToolPageShell
      slug="child-welfare-institutions"
      title={catalogEntry.title}
      maxWidthClassName="max-w-3xl"
    >
      <ChildWelfareInstitutionsContent />
    </ToolPageShell>
  );
}
