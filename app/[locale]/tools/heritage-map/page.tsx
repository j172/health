import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import HeritageMapContent from "@/components/HeritageMap/HeritageMapContent";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #487 — locale-aware twin of app/(zh)/tools/heritage-map/page.tsx.
// HeritageMapContent itself was converted to read its own h1/description and
// all chrome (layer toggle labels, data-source line, locating button) through
// useLanguage()'s t() (heritageMapTool.* dictionary keys), since — unlike
// cool-spots/tourism-factories, which render through the generic
// FacilitySearchContent — this tool has a bespoke content component that
// renders its own duplicate <h1> independent of ToolPageShell's `title` prop.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/heritage-map";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("heritage-map", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["cultural heritage", "monuments", "historic buildings", "archaeological sites", "Taiwan"],
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

export default async function LocaleHeritageMapPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("heritage-map", locale);

  return (
    <ToolPageShell slug="heritage-map" title={meta.title} maxWidthClassName="max-w-5xl" locale={locale}>
      <HeritageMapContent />
    </ToolPageShell>
  );
}
