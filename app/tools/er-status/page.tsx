import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import EmergencyRoomContent from "@/components/Tools/EmergencyRoomContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { getEmergencyRoomOverview } from "@/lib/server/emergencyRooms/queries";

export const revalidate = 30;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/er-status`;
const catalogEntry = getToolCatalogEntry("er-status");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "急診即時看板",
    "急診室壅塞",
    "急救責任醫院",
    "急診滿床通報",
    "等候住院人數",
    "健保署急診即時資訊",
    "119送醫分流",
    "全台急診候診查詢",
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default async function ErStatusPage() {
  let initialData;
  try {
    initialData = await getEmergencyRoomOverview();
  } catch (err) {
    console.warn("Failed to fetch initial ER data on server:", err);
  }

  return (
    <ToolPageShell slug="er-status" title={catalogEntry.title} maxWidthClassName="max-w-6xl">
      <ContextualPartnerCard
        partnerId="kuma"
        contextTitle="急診分流與平時自救準備"
        contextDescription="合理利用緊急醫療資源，非危急病症請善用門診分流；平時前往「黑熊學院」掌握家庭急救包必備物資與第一時間止血自救觀念。"
      />
      <EmergencyRoomContent initialData={initialData} />
    </ToolPageShell>
  );
}
