import Link from "next/link";
import type { Metadata } from "next";
import { buildBreadcrumbJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import NearbyContent from "@/components/Nearby/NearbyContent";

export const runtime = "nodejs";

const NEARBY_DESCRIPTION =
  "定位一次，同時查詢 AED、診所、藥局、公廁、涼適點、無障礙ATM、急診即時壅塞、避難所等急用點位，各顯示最近 3 筆並標示距離，可展開查看更多設施類型。";

/**
 * "/nearby" — issue #466 (parent #438 §F)：一次定位看全部急用點位。
 *
 * Server page.tsx does nothing async itself (same split as
 * CareCircleMap.tsx / FacilitySearchContent.tsx's consumers) — all
 * geolocation + fetching lives in the client component below.
 */
export const metadata: Metadata = {
  title: "我附近：一次定位看全部急用點位",
  description: NEARBY_DESCRIPTION,
  alternates: {
    canonical: `${getBaseUrl()}/nearby`,
  },
  openGraph: {
    title: `我附近 | ${SITE_NAME}`,
    description: NEARBY_DESCRIPTION,
    url: `${getBaseUrl()}/nearby`,
    type: "website",
  },
};

export default function NearbyPage() {
  const baseUrl = getBaseUrl();
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "首頁", url: baseUrl },
    { name: "我附近", url: `${baseUrl}/nearby` },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      {/* Machine-readable sibling versions of this page (issue #444 pattern, issue #466),
       * built from the exact same NearbyTypeDef registry NearbyContent.tsx renders from
       * via lib/server/content/nearbyContent.ts. */}
      <link rel="alternate" type="text/plain" title="我附近 - LLM Index (llms.txt)" href="/nearby/llms.txt" />
      <link rel="alternate" type="text/markdown" title="我附近 - Clean Markdown" href="/nearby/markdown" />
      <div className="min-h-screen bg-white text-neutral-800 dark:bg-slate-900 dark:text-slate-100">
        <StabloHeader />

        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <nav className="mb-6 text-sm text-neutral-500 dark:text-slate-400" aria-label="breadcrumb">
            <Link href="/" className="hover:text-neutral-900 dark:hover:text-slate-100">
              首頁
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <span aria-current="page">我附近</span>
          </nav>

          <div className="mb-6">
            <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
              📍 我附近
            </h1>
            <p className="text-sm text-neutral-600 dark:text-slate-400">{NEARBY_DESCRIPTION}</p>
          </div>

          <NearbyContent />
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
