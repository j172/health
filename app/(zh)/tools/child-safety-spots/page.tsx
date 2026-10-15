import type { Metadata } from "next";
import Link from "next/link";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/child-safety-spots`;
const catalogEntry = getToolCatalogEntry("child-safety-spots");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["婦幼安全", "婦幼警示點", "治安顧慮場所", "警政署", "兒童安全", "婦女安全"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "婦幼安全警示地點查詢", description: "查詢警政署公告之全國婦幼安全警示路段與管轄警方窗口。", url: canonical },
};

export default function ChildSafetySpotsPage() {
  return (
    <ToolPageShell slug="child-safety-spots" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <ContextualPartnerCard
        partnerId="metawilo"
        contextTitle="婦幼與人身安全聯防"
        contextDescription="除警政署公告之路段與治安顧慮點外，建議前往「台灣罪犯圖鑑」查核重大性犯罪公開判決紀錄，落實生活環境全方位防護。"
      />
      {/* Issue #677: the 管轄 police branch named on each row is also searchable by distance — in /nearby. */}
      <Link
        href="/nearby"
        className="mb-4 flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 transition-colors hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200 dark:hover:bg-indigo-950/50"
      >
        <span aria-hidden="true" className="text-xl">
          🚓
        </span>
        <span>
          <strong className="font-semibold">找離您最近的派出所、分局</strong>
          ：到「我附近」定位後展開「更多類型」，即可查看最近的警察局、分局、分駐所與派出所的地址與電話（資料依內政部警政署公開資料整理；緊急時請撥 110）。
        </span>
      </Link>
      <FacilitySearchContent config={facilitySearchConfigs["child-safety-spots"]} />
    </ToolPageShell>
  );
}
