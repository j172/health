import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listAllLatestUvReadings } from "@/lib/server/cwa/queries";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import UvContent from "@/app/(zh)/tools/uv/UvContent";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #486 batch — thin locale-parameterized twin of
// app/(zh)/tools/uv/page.tsx: same ToolPageShell + UvContent (colocated
// component, imported directly — not duplicated) and the same
// listAllLatestUvReadings() server fetch. Station names/county names stay as
// the live CWA data; only the UV-level grading labels (低量/中量/高量/過量/極高量)
// and sunscreen-advice copy are localized — see UvContent.tsx.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/uv";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("uv", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["UV index", "ultraviolet", "sun protection", "Taiwan weather station"],
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

export default async function LocaleUvPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("uv", locale);
  const stations = await listAllLatestUvReadings();

  return (
    <ToolPageShell slug="uv" title={meta.title} maxWidthClassName="max-w-5xl" locale={locale}>
      <UvContent stations={stations} />
    </ToolPageShell>
  );
}
