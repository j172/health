import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import BloodPressureAnalyzer from "./BloodPressureAnalyzer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/blood-pressure`;

export const metadata: Metadata = {
  title: "血壓分析器",
  description: "依 2023 ESH 高血壓指南分類血壓等級，支援多次記錄與平均值分析，提供個人化生活建議。",
  keywords: ["血壓分析", "高血壓", "ESH指南", "血壓分類"],
  alternates: { canonical },
  openGraph: { title: "血壓分析器", description: "依 2023 ESH 高血壓指南分類血壓等級。", url: canonical },
};

export default function BloodPressurePage() {
  return (
    <ToolPageShell slug="blood-pressure" title="血壓分析器">
      <BloodPressureAnalyzer />
    </ToolPageShell>
  );
}
