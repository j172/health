import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import EmergencyRoomContent from "@/components/Tools/EmergencyRoomContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { getEmergencyRoomOverview } from "@/lib/server/emergencyRooms/queries";
import { parseGeolocationOverrideFromPlainParams } from "@/lib/utils/geolocationOverride";

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

export default async function ErStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string }>;
}) {
  // issue #463：地圖彈出視窗「看附近的急診」深連結帶入的 ?lat=&lng=，有提供時
  // 讓急診看板以該點位（而非使用者裝置定位）為中心，依距離排序顯示結果。
  const locationOverride = parseGeolocationOverrideFromPlainParams(await searchParams);

  let initialData;
  try {
    initialData = await getEmergencyRoomOverview(
      locationOverride ? { lat: locationOverride.lat, lng: locationOverride.lng } : undefined,
    );
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
      <EmergencyRoomContent initialData={initialData} locationOverride={locationOverride} />
    </ToolPageShell>
  );
}
