import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import AqiContent from "./AqiContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/aqi`;

export const metadata: Metadata = {
  title: "AQI 空氣品質即時查詢",
  description: "即時顯示全台環境部監測站 AQI 空氣品質指標，包含 PM2.5、PM10 等污染物濃度。",
  keywords: ["AQI", "空氣品質", "PM2.5", "環境部"],
  alternates: { canonical },
  openGraph: { title: "AQI 空氣品質即時查詢", description: "即時顯示全台空氣品質指標。", url: canonical },
};

export default function AqiPage() {
  return (
    <ToolPageShell slug="aqi" title="AQI 空氣品質即時查詢" maxWidthClassName="max-w-5xl">
      <AqiContent />
    </ToolPageShell>
  );
}
