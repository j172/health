import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import MetroAlertsContent from "@/components/Tools/MetroAlertsContent";
import { getMetroAlerts } from "@/lib/server/metroAlerts/queries";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #486 (parent #438 §Q) — thin locale-parameterized twin of
// app/(zh)/tools/metro-alerts/page.tsx, same ToolPageShell + MetroAlertsContent
// components, same server-side getMetroAlerts({ limit: 50 }) ISR-friendly
// fetch (revalidate=300) as the zh page. Alert content itself (station
// names, operator names, announcement text from TDX/Taipei Metro) is
// government data and stays in Chinese verbatim — see MetroAlertsContent.tsx.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/metro-alerts";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("metro-alerts", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: [
      "metro alerts",
      "MRT elevator maintenance",
      "Taipei metro real-time info",
      "accessible elevator status",
      "Taipei MRT service notices",
      "TRA train delays",
      "THSR service suspension",
      "Taiwan rail disruptions",
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

export default async function LocaleMetroAlertsPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("metro-alerts", locale);

  // Same ISR-friendly server fetch as the zh page.
  const initialAlerts = await getMetroAlerts({ limit: 50 });

  return (
    <ToolPageShell slug="metro-alerts" title={meta.title} locale={locale} maxWidthClassName="max-w-3xl">
      <Suspense>
        <MetroAlertsContent initialAlerts={initialAlerts} />
      </Suspense>
    </ToolPageShell>
  );
}
