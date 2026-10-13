import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import AqiContent from "@/app/(zh)/tools/aqi/AqiContent";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #486 batch — thin locale-parameterized twin of
// app/(zh)/tools/aqi/page.tsx: same ToolPageShell + AqiContent (colocated
// component, imported directly — not duplicated). AqiContent fetches its own
// data client-side from /api/aqi, so there's no server fetch here either, same
// as the zh page. Station names/counties stay as the live MOENV data; only
// the AQI status grading labels (良好/普通/...) and surrounding UI chrome are
// localized — see AqiContent.tsx.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/aqi";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("aqi", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["AQI", "air quality index", "PM2.5", "Taiwan air quality"],
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

export default async function LocaleAqiPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("aqi", locale);

  return (
    <ToolPageShell slug="aqi" title={meta.title} maxWidthClassName="max-w-5xl" locale={locale}>
      <AqiContent />
    </ToolPageShell>
  );
}
