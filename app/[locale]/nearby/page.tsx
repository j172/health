import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildBreadcrumbJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import { buildNearbyJsonLdEntries } from "@/lib/server/seo/nearbyJsonLd";
import { buildNearbyGraphJsonLd, serializeJsonLd } from "@/lib/server/seo/structuredData";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import NearbyContent from "@/components/Nearby/NearbyContent";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedPageMeta } from "@/lib/i18n/pageContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";
import { getDictionary } from "@/lib/i18n/dictionary";

/**
 * Issue #487 — locale-aware twin of app/(zh)/nearby/page.tsx ("我附近",
 * issue #466). NearbyContent itself (components/Nearby/NearbyContent.tsx)
 * was converted to read every UI-chrome string through useLanguage()'s t()
 * and to re-resolve each facility-type's display label from
 * lib/i18n/nearbyLabelContent.ts — this page is otherwise a thin,
 * locale-parameterized copy of the zh page, same split ToolPageShell-based
 * pages use (breadcrumb/metadata here, interactive content in the shared
 * client component). StabloHeader/StabloFooter stay Chinese on this page,
 * same as every other translated page in this repo (see ToolPageShell,
 * issue #485) — only this page's OWN content is in scope for translation.
 */

export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/nearby";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedPageMeta("nearby", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical, languages },
    openGraph: {
      title: `${meta.title} | ${SITE_NAME}`,
      description: meta.description,
      url: canonical,
      type: "website",
      locale: OG_LOCALE[locale],
      alternateLocale: ogAlternateLocales(locale),
    },
  };
}

export default async function LocaleNearbyPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedPageMeta("nearby", locale);
  const shortTitle = meta.shortTitle ?? meta.title;
  const { t } = getDictionary(locale);
  const baseUrl = getBaseUrl();
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: t("toolShell.home", "首頁"), url: baseUrl },
    { name: shortTitle, url: `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}` },
  ]);
  // Issue #438 §R: same ItemList of facility types as the zh page, plus this
  // locale's `inLanguage` and a `translationOfWork` link back to /nearby.
  // Nothing per-visitor (geolocation results stay client-side) is included.
  const nearbyGraph = buildNearbyGraphJsonLd(
    { name: meta.title, description: meta.description, entries: buildNearbyJsonLdEntries(baseUrl, locale) },
    { locale },
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(nearbyGraph) }} />
      {/* Machine-readable sibling versions of this locale's "/nearby" page
       * (issue #488, extending issue #466's zh-only pattern) — built from
       * the exact same NearbyTypeDef registry + getLocalizedPageMeta this
       * page itself renders from, via
       * lib/server/content/nearbyContent.ts's buildLocaleNearbyLlmsPageContent. */}
      <link
        rel="alternate"
        type="text/plain"
        title={`${shortTitle} - LLM Index (llms.txt)`}
        href={`${buildLocalizedPath(CANONICAL_PATH, locale)}/llms.txt`}
      />
      <link
        rel="alternate"
        type="text/markdown"
        title={`${shortTitle} - Clean Markdown`}
        href={`${buildLocalizedPath(CANONICAL_PATH, locale)}/markdown`}
      />
      <div className="min-h-screen bg-white text-neutral-800 dark:bg-slate-900 dark:text-slate-100">
        <StabloHeader />

        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <nav className="mb-6 text-sm text-neutral-500 dark:text-slate-400" aria-label="breadcrumb">
            <Link href="/" className="hover:text-neutral-900 dark:hover:text-slate-100">
              {t("toolShell.home", "首頁")}
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <span aria-current="page">{shortTitle}</span>
          </nav>

          <div className="mb-6">
            <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
              📍 {shortTitle}
            </h1>
            <p className="text-sm text-neutral-600 dark:text-slate-400">{meta.description}</p>
          </div>

          <NearbyContent />
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
