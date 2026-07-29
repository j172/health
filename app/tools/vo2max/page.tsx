import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import VO2MaxCalculator from "./VO2MaxCalculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/vo2max`;

export const metadata: Metadata = {
  title: "VO2Max 估算器",
  description: "輸入年齡與安靜心率，以 Uth 公式快速評估最大攝氧量（VO2Max），對照 ACSM 標準了解您的心肺耐力等級，安靜心率可直接參考 Apple Watch 或 iPhone 健康 App 的紀錄。",
  keywords: ["VO2Max", "最大攝氧量", "心肺耐力", "Uth公式", "Apple Watch VO2Max", "iPhone健康App"],
  alternates: { canonical },
  openGraph: { title: "VO2Max 估算器", description: "快速評估最大攝氧量，了解心肺耐力等級，支援 Apple Watch 安靜心率數值。", url: canonical },
};

export default function Vo2maxPage() {
  return (
    <ToolPageShell slug="vo2max" title="VO2Max 估算器">
      <VO2MaxCalculator />
    </ToolPageShell>
  );
}
