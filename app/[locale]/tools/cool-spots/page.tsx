import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "@/app/(zh)/tools/facilityConfigs";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #487 — locale-aware twin of app/(zh)/tools/cool-spots/page.tsx.
// Unlike the issue #485 pilot pages (AedContent/EmergencyRoomContent, both
// bespoke components), this tool renders through the generic, 30+-tool-wide
// FacilitySearchContent + facilitySearchConfigs pairing. Reuses issue #486's
// `slug` prop mechanism (not a separate locale-config object): the real zh
// `facilitySearchConfigs.cool-spots` is passed straight through, and
// FacilitySearchContent itself looks up the `coolSpotsTool.*` dictionary
// namespace for its handful of config-authored UI strings (title,
// searchPlaceholder, errorText, emptyState*, serviceItemLabel, noun,
// fallbackNotice*). Facility rows themselves (names/addresses) stay Chinese
// verbatim, same government-data convention as every other translated tool.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/cool-spots";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("cool-spots", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["cool spots", "Cool Map", "heatwave relief", "cooling station"],
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

export default async function LocaleCoolSpotsPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("cool-spots", locale);

  return (
    <ToolPageShell slug="cool-spots" title={meta.title} maxWidthClassName="max-w-3xl" locale={locale}>
      <FacilitySearchContent config={facilitySearchConfigs["cool-spots"]} slug="cool-spots" />
    </ToolPageShell>
  );
}
