import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "@/app/(zh)/tools/facilityConfigs";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #486 (parent #438 §Q) — thin locale-parameterized twin of
// app/(zh)/tools/public-toilets/page.tsx: same ToolPageShell +
// FacilitySearchContent components, same facilitySearchConfigs["public-toilets"]
// config and the one /api/facilities-backed data source. FacilitySearchContent
// takes a `slug="public-toilets"` prop (issue #486) that looks up its own
// small set of config-authored UI strings under the `publicToiletsTool.*`
// dictionary namespace — government facility names/addresses stay in
// Chinese verbatim, same rule as the issue #485 pilot pages.
//
// Same as the zh page: StabloHeader renders a live DB-backed weather-alert
// bar, so this page can't be statically prerendered at build time either.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/public-toilets";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("public-toilets", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: [
      "public restroom Taiwan",
      "accessible restroom",
      "family restroom",
      "gender-neutral restroom",
      "diaper changing station",
    ],
    alternates: { canonical, languages },
    // Matches app/(zh)/tools/public-toilets/page.tsx's own metadata.
    robots: { index: false },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: canonical,
      locale: OG_LOCALE[locale],
      alternateLocale: ogAlternateLocales(locale),
    },
  };
}

export default async function LocalePublicToiletsPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("public-toilets", locale);

  return (
    <ToolPageShell slug="public-toilets" title={meta.title} maxWidthClassName="max-w-3xl" locale={locale}>
      <FacilitySearchContent config={facilitySearchConfigs["public-toilets"]} slug="public-toilets" />
    </ToolPageShell>
  );
}
