import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { parseGeolocationOverrideFromPlainParams } from "@/lib/utils/geolocationOverride";
import { facilitySearchConfigs } from "@/app/(zh)/tools/facilityConfigs";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #486 (parent #438 §Q) — thin locale-parameterized twin of
// app/(zh)/tools/pharmacies/page.tsx: same ToolPageShell + FacilitySearchContent
// components, same facilitySearchConfigs.pharmacies config and the one
// /api/facilities-backed data source, including the same issue #463
// `?lat=&lng=` map-popup deep-link override parsed server-side here and
// passed down as `locationOverride`. FacilitySearchContent takes a
// `slug="pharmacies"` prop (issue #486) that looks up its own small set of
// config-authored UI strings under the `pharmaciesTool.*` dictionary
// namespace — government facility names/addresses stay in Chinese verbatim,
// same rule as the issue #485 pilot pages.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/pharmacies";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("pharmacies", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["pharmacy search Taiwan", "NHI-contracted pharmacy", "drug store directory"],
    alternates: { canonical, languages },
    // Matches app/(zh)/tools/pharmacies/page.tsx's own metadata.
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

export default async function LocalePharmaciesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ lat?: string; lng?: string }>;
}) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("pharmacies", locale);

  // issue #463: same ?lat=&lng= map-popup deep-link override as the zh page
  // — see app/(zh)/tools/pharmacies/page.tsx's own comment.
  const locationOverride = parseGeolocationOverrideFromPlainParams(await searchParams);

  return (
    <ToolPageShell slug="pharmacies" title={meta.title} maxWidthClassName="max-w-3xl" locale={locale}>
      <FacilitySearchContent
        config={facilitySearchConfigs.pharmacies}
        locationOverride={locationOverride}
        slug="pharmacies"
      />
    </ToolPageShell>
  );
}
