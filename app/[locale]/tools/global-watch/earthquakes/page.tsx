import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGlobeWatchEarthquakeCandidates, getTieredEarthquakes } from "@/lib/server/earthquakes/queries";
import { getRecentEqGdacsEvents } from "@/lib/server/gdacs/queries";
import { buildBreadcrumbJsonLd, getBaseUrl } from "@/lib/server/news/seo";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import GlobeWatchEarthquakesItem from "@/components/Tools/GlobeWatch/GlobeWatchEarthquakesItem";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedPageMeta } from "@/lib/i18n/pageContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";
import { getDictionary } from "@/lib/i18n/dictionary";
import type { EarthquakeGlobeRow } from "@/lib/tools/globeWatch/earthquakeGlobeFeatures";

/**
 * Issue #588 (parent #583): locale-parameterized twin of
 * app/(zh)/tools/global-watch/earthquakes/page.tsx — same split as
 * app/[locale]/tools/earthquakes/page.tsx (thin locale page, shared client
 * component). Only this page's own chrome (breadcrumb, title/description)
 * is translated; EarthquakeContent's live CWA/USGS data stays as-is (issue
 * #485's "government data stays in Chinese" rule, routed through
 * EarthquakeContent's own locale-aware place-name branch).
 */
export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/global-watch/earthquakes";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedPageMeta("globalWatchEarthquakes", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["earthquake", "Taiwan earthquake", "significant earthquake", "tsunami warning", "global watch", "3D globe earthquake map"],
    alternates: { canonical, languages },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: canonical,
      locale: OG_LOCALE[locale],
      alternateLocale: ogAlternateLocales(locale),
    },
  };
}

const GLOBAL_WATCH_LABEL: Record<"en" | "ja" | "ko", string> = {
  en: "Global Watch",
  ja: "グローバルウォッチ",
  ko: "글로벌 워치",
};

export default async function LocaleGlobalWatchEarthquakesPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedPageMeta("globalWatchEarthquakes", locale);
  const { t } = getDictionary(locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const globalWatchHref = buildLocalizedPath("/tools/global-watch", locale);

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
    { name: t("toolShell.home", "首頁"), url: baseUrl },
    { name: GLOBAL_WATCH_LABEL[locale], url: `${baseUrl}${globalWatchHref}` },
    { name: meta.shortTitle ?? meta.title, url: canonical },
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
                <Link href={`/${locale}`} className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  {t("toolShell.home", "首頁")}
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li>
                <Link href={globalWatchHref} className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  {GLOBAL_WATCH_LABEL[locale]}
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li aria-current="page" className="font-semibold text-slate-700 dark:text-slate-300">
                {meta.shortTitle ?? meta.title}
              </li>
            </ol>
          </nav>

          <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">🌍 {meta.shortTitle ?? meta.title}</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{meta.description}</p>

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
