import type { Metadata } from "next";
import Link from "next/link";
import { getGlobeWatchEarthquakeCandidates, getTieredEarthquakes } from "@/lib/server/earthquakes/queries";
import { getRecentEqGdacsEvents } from "@/lib/server/gdacs/queries";
import { buildBreadcrumbJsonLd, getBaseUrl } from "@/lib/server/news/seo";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import OtherLanguagesBanner from "@/components/Tools/OtherLanguagesBanner";
import GlobeWatchEarthquakesItem from "@/components/Tools/GlobeWatch/GlobeWatchEarthquakesItem";
import { buildHreflangAlternates } from "@/lib/i18n/translatedPages";
import type { EarthquakeGlobeRow } from "@/lib/tools/globeWatch/earthquakeGlobeFeatures";

/**
 * Issue #588 (parent #583): the first global-watch item sub-route —
 * `/tools/global-watch/earthquakes`. Deliberately NOT built on
 * ToolPageShell (unlike most /tools/<slug> pages): this is a sub-route of
 * the "global-watch" tool, not its own TOOL_CATALOG entry, and reusing
 * ToolPageShell's slug-driven catalog/i18n machinery (JSON-LD, related
 * tools, FAQ) would either require a misleading new "global-watch"
 * catalog-slug alias or silently fall back to Chinese catalog content on
 * every locale page. Instead this follows the plainer, catalog-independent
 * "standalone page" pattern app/(zh)/nearby/page.tsx already uses
 * (StabloHeader/Footer + its own breadcrumb/JSON-LD), with
 * `lib/i18n/pageContent.ts`'s `getLocalizedPageMeta` for its own
 * per-locale title/description rather than `getLocalizedToolMeta`.
 *
 * Server-renders the existing "顯著地震" list rule unchanged
 * (getTieredEarthquakes(168, 100), same as app/(zh)/tools/earthquakes) —
 * this item does NOT retire that page; #590 (separately blocked) will.
 */
export const revalidate = 300;
export const runtime = "nodejs";

const CANONICAL_PATH = "/tools/global-watch/earthquakes";
const baseUrl = getBaseUrl();
const canonical = `${baseUrl}${CANONICAL_PATH}`;

const TITLE = "全球動態地球：地震 | 全球與台灣顯著地震即時地圖";
const DESCRIPTION =
  "在可拖曳旋轉的 3D 地球上查看近 7 天全球 M4.5+ 與台灣 M4.0+ 地震標記（含海嘯警報標記），並列出近 7 天台灣 M4.0+、全球 M6.0+ 顯著地震清單，包含震央地點、規模、深度與資料來源。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["地震", "地震速報", "震度", "海嘯", "全球動態地球", "地震地圖", "3D地震地圖"],
  alternates: { canonical, languages: buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: canonical,
  },
};

export default async function GlobalWatchEarthquakesPage() {
  // Two independent fetches on purpose (see
  // lib/tools/globeWatch/earthquakeGlobeFeatures.ts's module doc comment):
  // the list keeps the existing "顯著地震" rule; the globe's own, wider
  // threshold is computed by the pure transform module from the broader
  // candidate rows below.
  const [earthquakes, globeCandidates, gdacsEqEvents] = await Promise.all([
    getTieredEarthquakes(168, 100),
    getGlobeWatchEarthquakeCandidates(),
    getRecentEqGdacsEvents(),
  ]);

  const globeRows: EarthquakeGlobeRow[] = globeCandidates.map((row) => ({
    id: row.id,
    eventTime: row.event_time,
    magnitude: row.magnitude,
    depthKm: row.depth_km,
    lat: row.lat,
    lng: row.lng,
    place: row.place,
    placeZh: row.place_zh,
    tsunamiWarning: row.tsunami_warning === 1,
    primarySource: row.primary_source,
    url: row.url,
    cwaSourced: row.cwa_sourced,
  }));

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "首頁", url: baseUrl },
    { name: "全球動態地球", url: `${baseUrl}/tools/global-watch` },
    { name: "地震", url: canonical },
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
                地震
              </li>
            </ol>
          </nav>

          <OtherLanguagesBanner canonicalPath={CANONICAL_PATH} />

          <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">🌍 全球動態地球：地震</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{DESCRIPTION}</p>

            <div className="mt-6">
              <GlobeWatchEarthquakesItem earthquakes={earthquakes} globeRows={globeRows} gdacsEvents={gdacsEqEvents} />
            </div>
          </div>
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
