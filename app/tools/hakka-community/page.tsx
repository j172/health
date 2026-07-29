import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import HakkaCommunityContent from "./HakkaCommunityContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/hakka-community`;

export const metadata: Metadata = {
  title: "客庄社區發展協會查詢",
  description: "查詢客家委員會客庄社區發展協會名冊，支援關鍵字搜尋與附近定位。",
  keywords: ["客庄社區發展協會", "客家委員會", "社區照顧"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "客庄社區發展協會查詢", description: "查詢全台客庄社區發展協會。", url: canonical },
};

export default function HakkaCommunityPage() {
  return (
    <ToolPageShell slug="hakka-community" title="客庄社區發展協會查詢" maxWidthClassName="max-w-3xl">
      <HakkaCommunityContent />
    </ToolPageShell>
  );
}
