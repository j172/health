import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import { readSeedJson } from "@/lib/server/db/transientSeed";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import EmergencyHotlinesContent from "@/components/Tools/EmergencyHotlinesContent";
import type { HotlineRecord } from "@/lib/server/hotlines/hotlinesQueries";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #485 pilot page 1/3 — thin locale-parameterized twin of
// app/(zh)/tools/emergency-hotlines/page.tsx, same ToolPageShell +
// EmergencyHotlinesContent components and the same government-hotlines.json
// seed data (hotline names/agencies/categories stay in Chinese; see that
// component for the English-labelled category badges and localized
// copy/dial button text added for issue #485).

export const revalidate = 3600;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const slug = "emergency-hotlines";
const CANONICAL_PATH = `/tools/${slug}`;

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta(slug, locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["Taiwan emergency hotline", "110", "119", "112", "emergency phone numbers Taiwan"],
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

function getHotlinesData(): HotlineRecord[] {
  return readSeedJson<HotlineRecord[]>("government-hotlines.json") ?? [];
}

export default async function LocaleEmergencyHotlinesPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta(slug, locale);
  const hotlines = getHotlinesData();

  return (
    <ToolPageShell slug={slug} title={meta.title} maxWidthClassName="max-w-6xl" locale={locale}>
      <EmergencyHotlinesContent initialHotlines={hotlines} />
    </ToolPageShell>
  );
}
