import type { Metadata } from "next";
import { Suspense } from "react";
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
  // issue #463 的 ?lat=&lng= 深連結覆寫座標改由 EmergencyRoomContent 透過
  // useSearchParams() 在 client 端讀取（見該檔案），不在這裡讀取 searchParams——
  // App Router 的 searchParams 屬於 Next.js 的 Dynamic API，一旦頁面讀取它就會
  // 整頁退出靜態渲染／ISR，讓本來每 30 秒（revalidate）才重新查詢一次、全站共用
  // 快取的 getEmergencyRoomOverview()（含壅塞統計與 25 家醫院的 24 小時走勢圖子查詢）
  // 變成每個請求都重新查一次，大幅增加資料庫負載，且這個代價會套用在沒有深連結、
  // 佔絕大多數的一般訪客身上。
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
      <Suspense>
        <EmergencyRoomContent initialData={initialData} />
      </Suspense>
    </ToolPageShell>
  );
}
