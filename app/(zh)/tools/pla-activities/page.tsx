import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import PlaActivitiesContent from "@/components/Tools/PlaActivitiesContent";
import { getPlaActivities } from "@/lib/server/plaActivities/queries";
import { OG_LOCALE, ogAlternateLocales } from "@/lib/i18n/dictionary";
import { buildHreflangAlternates } from "@/lib/i18n/translatedPages";

export const revalidate = 3600;
export const runtime = "nodejs";

const baseUrl = getBaseUrl();
const canonical = `${baseUrl}/tools/pla-activities`;
const catalogEntry = getToolCatalogEntry("pla-activities");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: catalogEntry.keywords,
  alternates: {
    canonical,
    languages: buildHreflangAlternates("/tools/pla-activities", baseUrl) ?? undefined,
  },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
    locale: OG_LOCALE["zh-TW"],
    alternateLocale: ogAlternateLocales("zh-TW"),
  },
};

export default async function PlaActivitiesPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activities = await getPlaActivities(30);

  return (
    <ToolPageShell
      slug="pla-activities"
      title={catalogEntry.title}
      maxWidthClassName="max-w-5xl"
    >
      <PlaActivitiesContent
        activities={activities}
        initialDate={resolvedSearchParams?.date}
      />
    </ToolPageShell>
  );
}
