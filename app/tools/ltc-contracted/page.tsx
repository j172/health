import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import LtcContractedContent from "./LtcContractedContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/ltc-contracted`;

export const metadata: Metadata = {
  title: "長照特約服務機構查詢",
  description: "查詢衛福部長照2.0特約服務機構，涵蓋居家服務、日間照顧、喘息服務等，支援關鍵字搜尋與附近定位。",
  keywords: ["長照特約機構", "長照2.0", "居家服務", "日間照顧", "喘息服務"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "長照特約服務機構查詢", description: "查詢全台長照2.0特約服務機構。", url: canonical },
};

export default function LtcContractedPage() {
  return (
    <ToolPageShell slug="ltc-contracted" title="長照特約服務機構查詢" maxWidthClassName="max-w-3xl">
      <LtcContractedContent />
    </ToolPageShell>
  );
}
