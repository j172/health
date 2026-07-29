import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import DisabilityWelfareContent from "./DisabilityWelfareContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/disability-welfare`;

export const metadata: Metadata = {
  title: "身心障礙福利機構查詢",
  description: "查詢衛福部全國身心障礙福利機構名冊，支援關鍵字搜尋與附近定位。",
  keywords: ["身心障礙福利機構", "身障機構查詢", "衛福部"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "身心障礙福利機構查詢", description: "查詢全台身心障礙福利機構。", url: canonical },
};

export default function DisabilityWelfarePage() {
  return (
    <ToolPageShell slug="disability-welfare" title="身心障礙福利機構查詢" maxWidthClassName="max-w-3xl">
      <DisabilityWelfareContent />
    </ToolPageShell>
  );
}
