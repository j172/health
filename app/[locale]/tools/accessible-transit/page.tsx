import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import AccessibleTransitContent from "@/components/Tools/AccessibleTransitContent";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #486 — thin, locale-parameterized twin of
// app/(zh)/tools/accessible-transit/page.tsx, following the exact
// app/[locale]/tools/aed/page.tsx pattern from issue #485: both call the
// same ToolPageShell + AccessibleTransitContent components (no forked
// copies), and both read government transit-accessibility data (TDX bus
// data, Rehabus hotlines, station facilities) from the one
// /api/accessible-transit endpoint — see AccessibleTransitContent.tsx, which
// keeps county/city names, agency names, and bus-route data in Chinese.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/accessible-transit";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("accessible-transit", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: [
      "accessible transit Taiwan",
      "low-floor bus",
      "wheelchair accessible bus",
      "metro accessibility",
      "Taiwan Railway accessible boarding",
      "High Speed Rail wheelchair seat",
      "Rehabus dispatch hotline",
      "universal accessible taxi",
      "wheelchair travel",
      "long-term care transportation",
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

export default async function LocaleAccessibleTransitPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("accessible-transit", locale);

  return (
    <ToolPageShell slug="accessible-transit" title={meta.title} maxWidthClassName="max-w-6xl" locale={locale}>
      <Suspense>
        <AccessibleTransitContent />
      </Suspense>
    </ToolPageShell>
  );
}
