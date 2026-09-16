import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import EmergencyRoomContent from "@/components/Tools/EmergencyRoomContent";
import { getEmergencyRoomOverview } from "@/lib/server/emergencyRooms/queries";

export const dynamic = "force-dynamic";
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
      <EmergencyRoomContent initialData={initialData} />
    </ToolPageShell>
  );
}
