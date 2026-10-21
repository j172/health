import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentGdeltConflictEvents } from "@/lib/server/conflicts/queries";
import { buildConflictsGlobeData } from "@/lib/tools/globeWatch/conflictsTransform";
import { buildBreadcrumbJsonLd, getBaseUrl } from "@/lib/server/news/seo";
import { buildLocalizedWebPageJsonLd, serializeJsonLd } from "@/lib/server/seo/structuredData";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import GlobeWatchConflictsItem from "@/components/Tools/GlobeWatch/GlobeWatchConflictsItem";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedPageMeta } from "@/lib/i18n/pageContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";
import { getDictionary } from "@/lib/i18n/dictionary";

/**
 * Issue #774 (parent #773): locale-parameterized twin of
 * app/(zh)/tools/global-watch/conflicts/page.tsx — same split as the
 * typhoons/disasters/epidemics items' own [locale] pages. Only this page's
 * own chrome (breadcrumb, title/description) is translated; the GDELT data
 * itself stays as-is (issue #485's "government/open data stays in Chinese"
 * rule — GDELT's own fields are already in English, untouched here).
 */
export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/global-watch/conflicts";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedPageMeta("globalWatchConflicts", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["armed conflict", "GDELT", "global watch", "conflict map", "3D globe", "open data"],
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

export default async function LocaleGlobalWatchConflictsPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedPageMeta("globalWatchConflicts", locale);
  const { t } = getDictionary(locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const globalWatchHref = buildLocalizedPath("/tools/global-watch", locale);

  const rows = await getCurrentGdeltConflictEvents();
  const data = buildConflictsGlobeData(rows);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: t("toolShell.home", "首頁"), url: baseUrl },
    { name: GLOBAL_WATCH_LABEL[locale], url: `${baseUrl}${globalWatchHref}` },
    { name: meta.shortTitle ?? meta.title, url: canonical },
  ]);
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
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">⚔️ {meta.shortTitle ?? meta.title}</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{meta.description}</p>

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
