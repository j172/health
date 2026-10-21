import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { readSeedJson } from "@/lib/server/db/transientSeed";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import EmergencyHotlinesContent from "@/components/Tools/EmergencyHotlinesContent";
import type { HotlineRecord } from "@/lib/server/hotlines/hotlinesQueries";
import { OG_LOCALE, ogAlternateLocales } from "@/lib/i18n/dictionary";
import { buildHreflangAlternates } from "@/lib/i18n/translatedPages";

export const revalidate = 3600;
export const runtime = "nodejs";

const slug = "emergency-hotlines";
const baseUrl = getBaseUrl();
const canonical = `${baseUrl}/tools/${slug}`;
const catalogEntry = getToolCatalogEntry(slug);

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "臺灣緊急電話",
    "政府簡碼專線",
    "110報案",
    "119火警救護",
    "112求救電話",
    "113婦幼保護",
    "165反詐騙",
    "1999市民熱線",
    "1922防疫專線",
    "1925安心專線",
    "1968路況專線",
    "1911停電通報",
    "1910自來水報修",
    "緊急電話直撥",
    "各縣市1999代表號",
  ],
  // issue #485: reciprocal hreflang to the real /en/, /ja/, /ko/ siblings.
  alternates: { canonical, languages: buildHreflangAlternates(`/tools/${slug}`, baseUrl) ?? undefined },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
    locale: OG_LOCALE["zh-TW"],
    alternateLocale: ogAlternateLocales("zh-TW"),
  },
};

function getHotlinesData(): HotlineRecord[] {
  return readSeedJson<HotlineRecord[]>("government-hotlines.json") ?? [];
}

export default async function EmergencyHotlinesPage() {
  const hotlines = getHotlinesData();

  return (
    <ToolPageShell slug={slug} title={catalogEntry.title} maxWidthClassName="max-w-6xl">
      <EmergencyHotlinesContent initialHotlines={hotlines} />
    </ToolPageShell>
  );
}
