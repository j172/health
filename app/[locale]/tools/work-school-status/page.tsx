import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import WorkSchoolStatusContent from "@/components/Tools/WorkSchoolStatusContent";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #691 — path-prefixed /en//ja//ko/ twin of
// app/(zh)/tools/work-school-status/page.tsx: the same ToolPageShell and the
// same WorkSchoolStatusContent (no forked copy), with the UI strings coming
// from locales/{en,ja,ko}.json (`workSchoolStatusTool.*`). Government data —
// holiday names (國慶日, 補假, 補行上班 …) and the official announcement pages
// the closure guidance links to — stays in Chinese.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/work-school-status";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("work-school-status", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: [
      "is today a working day Taiwan",
      "Taiwan typhoon day",
      "Taiwan make-up workday",
      "Taiwan public holidays",
      "DGPA office calendar",
      "work and school suspension Taiwan",
    ],
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

export default async function LocaleWorkSchoolStatusPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("work-school-status", locale);

  return (
    <ToolPageShell slug="work-school-status" title={meta.title} maxWidthClassName="max-w-4xl" locale={locale}>
      <WorkSchoolStatusContent />
    </ToolPageShell>
  );
}
