import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "@/app/(zh)/tools/facilityConfigs";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #487 — locale-aware twin of app/(zh)/tools/tourism-factories/page.tsx.
// Same FacilitySearchContent + `slug` prop pairing as cool-spots/page.tsx
// above (issue #486's mechanism) — see that file's comment for how the
// `tourismFactoriesTool.*` dictionary namespace covers title,
// searchPlaceholder, errorText, emptyState*, category labels, noun, and
// fallbackNotice*.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/tourism-factories";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("tourism-factories", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["tourism factory", "industrial culture museum", "Taiwan factory tour"],
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

export default async function LocaleTourismFactoriesPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("tourism-factories", locale);

  return (
    <ToolPageShell slug="tourism-factories" title={meta.title} maxWidthClassName="max-w-3xl" locale={locale}>
      <FacilitySearchContent config={facilitySearchConfigs["tourism-factories"]} slug="tourism-factories" />
    </ToolPageShell>
  );
}
