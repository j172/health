import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentGdeltConflictEvents } from "@/lib/server/conflicts/queries";
import { buildConflictsGlobeData } from "@/lib/tools/globeWatch/conflictsTransform";
import { buildBreadcrumbJsonLd, getBaseUrl } from "@/lib/server/news/seo";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import OtherLanguagesBanner from "@/components/Tools/OtherLanguagesBanner";
import GlobeWatchConflictsItem from "@/components/Tools/GlobeWatch/GlobeWatchConflictsItem";
import { buildHreflangAlternates } from "@/lib/i18n/translatedPages";

/**
 * Issue #774 (parent #773): the 武裝衝突 global-watch item sub-route —
 * `/tools/global-watch/conflicts`. Deliberately NOT built on ToolPageShell,
 * following app/(zh)/tools/global-watch/typhoons/page.tsx's own reasoning:
 * this is a sub-route of the "global-watch" tool, not its own TOOL_CATALOG
 * entry, so this uses the same plainer "standalone page" pattern
 * (StabloHeader/Footer + its own breadcrumb/JSON-LD) instead.
 *
 * GDELT-only for this ticket (UCDP is #775, still blocked) — a single
 * query, fetched server-side and transformed through the pure
 * lib/tools/globeWatch/conflictsTransform.ts module, so the list below is
 * genuinely server-rendered, same as every other Global Watch item.
 */
export const revalidate = 300;
export const runtime = "nodejs";

const CANONICAL_PATH = "/tools/global-watch/conflicts";
const baseUrl = getBaseUrl();
const canonical = `${baseUrl}${CANONICAL_PATH}`;

const TITLE = "全球動態地球：武裝衝突 | GDELT 全球衝突事件地圖";
const DESCRIPTION =
  "在可拖曳旋轉的 3D 地球上查看 GDELT 收錄的武裝衝突事件（只篩選 CAMEO「FIGHT」與「非常規大規模暴力」根類別，不是全世界所有新聞事件），每個標記都連回原始新聞來源；本頁僅轉載列名來源的公開資料，不代表本站對任何衝突的政治判斷。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["武裝衝突", "GDELT", "全球動態地球", "衝突地圖", "3D地球", "開放資料"],
  alternates: { canonical, languages: buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: canonical,
  },
};

export default async function GlobalWatchConflictsPage() {
  const rows = await getCurrentGdeltConflictEvents();
  const data = buildConflictsGlobeData(rows);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "首頁", url: baseUrl },
    { name: "全球動態地球", url: `${baseUrl}/tools/global-watch` },
    { name: "武裝衝突", url: canonical },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <StabloHeader />

        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <nav className="mb-6 text-xs font-medium text-slate-600 dark:text-slate-400" aria-label="breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  首頁
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li>
                <Link href="/tools/global-watch" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  全球動態地球
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li aria-current="page" className="font-semibold text-slate-700 dark:text-slate-300">
                武裝衝突
              </li>
            </ol>
          </nav>

          <OtherLanguagesBanner canonicalPath={CANONICAL_PATH} />

          <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">⚔️ 全球動態地球：武裝衝突</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{DESCRIPTION}</p>

            <div className="mt-6">
              <GlobeWatchConflictsItem data={data} />
            </div>
          </div>
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
