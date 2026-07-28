import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import ClinicsContent from "./ClinicsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/clinics`;

export const metadata: Metadata = {
  title: "醫療院所查詢",
  description: "查詢全民健保特約醫療院所，支援關鍵字搜尋與附近定位。",
  keywords: ["醫療院所查詢", "健保特約醫院", "台灣醫院搜尋"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "醫療院所查詢", description: "查詢全民健保特約醫療院所。", url: canonical },
};

export default function ClinicsPage() {
  return (
    <ToolPageShell slug="clinics" title="醫療院所查詢" maxWidthClassName="max-w-3xl">
      <ClinicsContent />
    </ToolPageShell>
  );
}
