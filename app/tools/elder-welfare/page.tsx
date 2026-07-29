import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import ElderWelfareContent from "./ElderWelfareContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/elder-welfare`;

export const metadata: Metadata = {
  title: "老人福利機構查詢",
  description: "查詢衛福部全國老人福利機構名冊，支援關鍵字搜尋與附近定位。",
  keywords: ["老人福利機構", "安養機構", "養護機構", "衛福部"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "老人福利機構查詢", description: "查詢全台老人福利機構。", url: canonical },
};

export default function ElderWelfarePage() {
  return (
    <ToolPageShell slug="elder-welfare" title="老人福利機構查詢" maxWidthClassName="max-w-3xl">
      <ElderWelfareContent />
    </ToolPageShell>
  );
}
