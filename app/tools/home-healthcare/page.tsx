import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import HomeHealthcareContent from "./HomeHealthcareContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/home-healthcare`;

export const metadata: Metadata = {
  title: "居家醫療查詢",
  description: "查詢提供居家醫療照護服務的全民健保特約機構，支援關鍵字搜尋與附近定位。",
  keywords: ["居家醫療", "居家照護", "居家安寧", "健保特約機構"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "居家醫療查詢", description: "查詢提供居家醫療照護服務的特約機構。", url: canonical },
};

export default function HomeHealthcarePage() {
  return (
    <ToolPageShell slug="home-healthcare" title="居家醫療查詢" maxWidthClassName="max-w-3xl">
      <HomeHealthcareContent />
    </ToolPageShell>
  );
}
