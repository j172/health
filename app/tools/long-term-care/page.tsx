import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import LongTermCareContent from "./LongTermCareContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/long-term-care`;

export const metadata: Metadata = {
  title: "長照機構查詢",
  description: "依您目前位置查詢附近的長期照顧服務機構。",
  keywords: ["長照機構", "長期照顧", "居家服務", "長照2.0"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "長照機構查詢", description: "查詢附近的長期照顧服務機構。", url: canonical },
};

export default function LongTermCarePage() {
  return (
    <ToolPageShell slug="long-term-care" title="長照機構查詢" maxWidthClassName="max-w-3xl">
      <LongTermCareContent />
    </ToolPageShell>
  );
}
