import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listActiveCwaTyphoons } from "@/lib/server/cwa/queries";
import { listActiveTcEvents } from "@/lib/server/gdacs/queries";
import { buildTyphoonsGlobeData } from "@/lib/tools/globeWatch/typhoonsTransform";
import { buildBreadcrumbJsonLd, getBaseUrl } from "@/lib/server/news/seo";
import { buildLocalizedWebPageJsonLd, serializeJsonLd } from "@/lib/server/seo/structuredData";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import GlobeWatchTyphoonsItem from "@/components/Tools/GlobeWatch/GlobeWatchTyphoonsItem";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedPageMeta } from "@/lib/i18n/pageContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";
import { getDictionary } from "@/lib/i18n/dictionary";

/**
 * Issue #593 (parent #583): locale-parameterized twin of
 * app/(zh)/tools/global-watch/typhoons/page.tsx — same split as the
 * earthquakes item's own [locale] page. Only this page's own chrome
 * (breadcrumb, title/description) is translated; the CWA/GDACS data itself
 * stays as-is (issue #485's "government data stays in Chinese" rule).
 */
export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/global-watch/typhoons";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedPageMeta("globalWatchTyphoons", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["typhoon", "tropical cyclone", "GDACS", "Taiwan typhoon", "global watch", "3D typhoon map"],
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

export default async function LocaleGlobalWatchTyphoonsPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedPageMeta("globalWatchTyphoons", locale);
  const { t } = getDictionary(locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const globalWatchHref = buildLocalizedPath("/tools/global-watch", locale);

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
    { name: t("toolShell.home", "首頁"), url: baseUrl },
    { name: GLOBAL_WATCH_LABEL[locale], url: `${baseUrl}${globalWatchHref}` },
    { name: meta.shortTitle ?? meta.title, url: canonical },
  ]);
  // Issue #438 §R "外語版": the breadcrumb alone has no `inLanguage`; this
  // WebPage node adds it plus `translationOfWork` back to the zh page.
  const localizedPage = buildLocalizedWebPageJsonLd(
    { name: meta.title, description: meta.description, canonicalPath: CANONICAL_PATH },
    { locale },
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(localizedPage) }} />
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
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">🌀 {meta.shortTitle ?? meta.title}</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{meta.description}</p>

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
