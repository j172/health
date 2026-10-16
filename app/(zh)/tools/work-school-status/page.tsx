import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import WorkSchoolStatusContent from "@/components/Tools/WorkSchoolStatusContent";
import { OG_LOCALE, ogAlternateLocales } from "@/lib/i18n/dictionary";
import { buildHreflangAlternates } from "@/lib/i18n/translatedPages";

// Issue #691. The calendar answer is fetched client-side from
// /api/tools/work-school-status (so "today" is never baked into cached HTML);
// the page itself only carries the static explanation, the closure guidance
// and the shell's FAQ/JSON-LD. StabloHeader renders a live DB-backed alert bar,
// so the page can't be prerendered at build time anyway.
export const revalidate = 300;
export const runtime = "nodejs";

const baseUrl = getBaseUrl();
const canonical = `${baseUrl}/tools/work-school-status`;
const catalogEntry = getToolCatalogEntry("work-school-status");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: catalogEntry.keywords,
  // Reciprocal hreflang to the real /en/, /ja/, /ko/ siblings (issue #485 flow).
  alternates: {
    canonical,
    languages: buildHreflangAlternates("/tools/work-school-status", baseUrl) ?? undefined,
  },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
    locale: OG_LOCALE["zh-TW"],
    alternateLocale: ogAlternateLocales("zh-TW"),
  },
};

export default function WorkSchoolStatusPage() {
  return (
    <ToolPageShell slug="work-school-status" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <WorkSchoolStatusContent />
    </ToolPageShell>
  );
}
