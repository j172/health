import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import YoubikeContent from "@/components/Tools/YoubikeContent";
import { searchYouBikeStations } from "@/lib/server/youbike/queries";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #486 — thin locale-parameterized twin of app/(zh)/tools/youbike/page.tsx,
// following the exact pattern app/[locale]/tools/er-status/page.tsx established
// for issue #485: same ToolPageShell + YoubikeContent components, same
// server-side searchYouBikeStations() ISR-friendly fetch (revalidate=300).
// Station names/addresses/county names from the live TDX feed stay in
// Chinese, with the Google Maps navigation button localized via
// getNavigationButtonLabel() inside YoubikeContent.tsx.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/youbike";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("youbike", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: [
      "YouBike",
      "YouBike 2.0",
      "Taiwan bike share",
      "public bicycle rental Taiwan",
      "bike station availability",
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

export default async function LocaleYoubikePage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("youbike", locale);

  // Same ISR-friendly server fetch as the zh page — searchYouBikeStations()
  // is read-only and shares the same 300s revalidate window.
  const initial = await searchYouBikeStations({ limit: 40 });

  return (
    <ToolPageShell slug="youbike" title={meta.title} maxWidthClassName="max-w-4xl" locale={locale}>
      <Suspense>
        <YoubikeContent initialStations={initial.stations} />
      </Suspense>
    </ToolPageShell>
  );
}
