import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import HealthChecksContent from "./HealthChecksContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/health-checks`;

export const metadata: Metadata = {
  title: "健康檢查機構查詢",
  description: "查詢勞工健康檢查認可醫療機構，支援關鍵字搜尋與附近定位。",
  keywords: ["健康檢查機構", "勞工健檢", "健檢醫院"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "健康檢查機構查詢", description: "查詢勞工健康檢查認可醫療機構。", url: canonical },
};

export default function HealthChecksPage() {
  return (
    <ToolPageShell slug="health-checks" title="健康檢查機構查詢" maxWidthClassName="max-w-3xl">
      <HealthChecksContent />
    </ToolPageShell>
  );
}
