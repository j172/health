import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import PharmaciesContent from "./PharmaciesContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/pharmacies`;

export const metadata: Metadata = {
  title: "藥局查詢",
  description: "查詢全台一般藥局及健保特約藥局，支援關鍵字搜尋與附近定位。",
  keywords: ["藥局查詢", "健保特約藥局", "一般藥局"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "藥局查詢", description: "查詢全台一般藥局及健保特約藥局。", url: canonical },
};

export default function PharmaciesPage() {
  return (
    <ToolPageShell slug="pharmacies" title="藥局查詢" maxWidthClassName="max-w-3xl">
      <PharmaciesContent />
    </ToolPageShell>
  );
}
