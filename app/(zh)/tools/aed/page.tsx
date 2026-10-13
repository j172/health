import type { Metadata } from "next";
import { Suspense } from "react";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import AedContent from "@/components/Tools/AedContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { OG_LOCALE, ogAlternateLocales } from "@/lib/i18n/dictionary";
import { buildHreflangAlternates } from "@/lib/i18n/translatedPages";

export const revalidate = 300;
export const runtime = "nodejs";

const baseUrl = getBaseUrl();
const canonical = `${baseUrl}/tools/aed`;
const catalogEntry = getToolCatalogEntry("aed");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "AED",
    "自動體外心臟去顫器",
    "公共場所AED地圖",
    "心臟驟停急救",
    "衛福部AED統計",
    "CPR+AED",
    "黃金4分鐘",
    "急救設備地圖",
  ],
  // issue #485: reciprocal hreflang — this zh page now declares its real
  // /en/, /ja/, /ko/ siblings (and itself + x-default), replacing the
  // absence of any such declaration before.
  alternates: { canonical, languages: buildHreflangAlternates("/tools/aed", baseUrl) ?? undefined },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
    locale: OG_LOCALE["zh-TW"],
    alternateLocale: ogAlternateLocales("zh-TW"),
  },
};

export default function AedPage() {
  return (
    <ToolPageShell slug="aed" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <ContextualPartnerCard
        partnerId="kuma"
        contextTitle="急救止血與生命守護訓練"
        contextDescription="搶救黃金時間不只依賴 AED 位置查詢：可前往「黑熊學院」接受現代創傷急救、止血帶操作與自救互救實體技能培訓。"
      />
      {/* AedContent 透過 useSearchParams 讀取 ?lat=&lng= 深連結覆寫座標（issue #463），
          App Router 要求這類用法要有 Suspense 邊界 */}
      <Suspense>
        <AedContent />
      </Suspense>
    </ToolPageShell>
  );
}
