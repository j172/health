import type { Metadata } from "next";
import Link from "next/link";
import { listActiveCwaTyphoons } from "@/lib/server/cwa/queries";
import { listActiveTcEvents } from "@/lib/server/gdacs/queries";
import { buildTyphoonsGlobeData } from "@/lib/tools/globeWatch/typhoonsTransform";
import { buildBreadcrumbJsonLd, getBaseUrl } from "@/lib/server/news/seo";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import OtherLanguagesBanner from "@/components/Tools/OtherLanguagesBanner";
import GlobeWatchTyphoonsItem from "@/components/Tools/GlobeWatch/GlobeWatchTyphoonsItem";
import { buildHreflangAlternates } from "@/lib/i18n/translatedPages";

/**
 * Issue #593 (parent #583): the 颱風 global-watch item sub-route —
 * `/tools/global-watch/typhoons`. Deliberately NOT built on ToolPageShell,
 * following app/(zh)/tools/global-watch/earthquakes/page.tsx's own
 * reasoning (see that file's doc comment): this is a sub-route of the
 * "global-watch" tool, not its own TOOL_CATALOG entry, so this uses the
 * same plainer "standalone page" pattern (StabloHeader/Footer + its own
 * breadcrumb/JSON-LD) instead.
 *
 * Both data sources are fetched server-side and merged through the pure
 * lib/tools/globeWatch/typhoonsTransform.ts module — no new sync pipeline
 * for either (CWA: lib/server/cwa/sources/typhoon.ts, already running;
 * GDACS: lib/server/gdacs/runSync.ts, issue #592) — so the list below is
 * genuinely server-rendered, same as the earthquakes item.
 */
export const revalidate = 300;
export const runtime = "nodejs";

const CANONICAL_PATH = "/tools/global-watch/typhoons";
const baseUrl = getBaseUrl();
const canonical = `${baseUrl}${CANONICAL_PATH}`;

const TITLE = "全球動態地球：颱風 | 西太平洋颱風與全球熱帶氣旋即時地圖";
const DESCRIPTION =
  "在可拖曳旋轉的 3D 地球上查看目前活動中的熱帶氣旋：西太平洋颱風取自中央氣象署資料（中文名稱、目前位置、路徑潛勢），其他洋區取自 GDACS 全球災害預警系統，確保同一個颱風不會重複出現；並提供台灣「氣象警報」工具頁連結。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["颱風", "颱風路徑", "颱風即時位置", "熱帶氣旋", "GDACS", "全球動態地球", "颱風地圖", "3D颱風地圖"],
  alternates: { canonical, languages: buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: canonical,
  },
};

export default async function GlobalWatchTyphoonsPage() {
  // Two independent sources merged by basin (see typhoonsTransform.ts's own
  // doc comment for the dedup rule) — neither query depends on the other.
  const [cwaRows, gdacsRows] = await Promise.all([listActiveCwaTyphoons(), listActiveTcEvents()]);

  const data = buildTyphoonsGlobeData(
    cwaRows.map((r) => ({
      alertKey: r.alert_key,
      event: r.event,
      headline: r.headline,
      description: r.description,
      areaDesc: r.area_desc,
      effective: r.effective,
      expires: r.expires,
      web: r.web,
    })),
    gdacsRows.map((r) => ({
      eventId: r.event_id,
      episodeId: r.episode_id,
      alertLevel: r.alert_level,
      countryIso: r.country_iso,
      lat: r.lat,
      lng: r.lng,
      startTime: r.start_time,
      endTime: r.end_time,
      title: r.title,
      reportUrl: r.report_url,
      basin: r.basin,
      trackGeoJson: r.track_geojson,
    })),
  );

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "首頁", url: baseUrl },
    { name: "全球動態地球", url: `${baseUrl}/tools/global-watch` },
    { name: "颱風", url: canonical },
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
                颱風
              </li>
            </ol>
          </nav>

          <OtherLanguagesBanner canonicalPath={CANONICAL_PATH} />

          <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">🌀 全球動態地球：颱風</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{DESCRIPTION}</p>

            <div className="mt-6">
              <GlobeWatchTyphoonsItem data={data} />
            </div>
          </div>
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
