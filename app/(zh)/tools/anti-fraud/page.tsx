import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import {
  getFraudDomainsTrendSummary,
  getLatestPoliceFraudInterdictionStats,
  getLatestFscFraudAdStats,
} from "@/lib/server/antiFraud/trendQueries";
import AntiFraudChecker from "./AntiFraudChecker";
import FraudTrendsSection from "./FraudTrendsSection";
import FraudMethodsGuide from "./FraudMethodsGuide";
import FraudHotlineLinks from "./FraudHotlineLinks";

// StabloHeader renders a live DB-backed weather-alert bar (same as /news),
// so this page can't be statically prerendered at build time either.
export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/anti-fraud`;
const catalogEntry = getToolCatalogEntry("anti-fraud");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: catalogEntry.keywords,
  alternates: { canonical },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default async function AntiFraudPage() {
  // issue #570: three independent trend queries, each already tolerant of
  // its own absence via withConnectionFallback (see trendQueries.ts) — a
  // fresh DB before the first monthly/weekly sync has run just renders an
  // empty trends section rather than failing the whole page.
  const [fraudDomainsTrend, policeStats, fscStats] = await Promise.all([
    getFraudDomainsTrendSummary(),
    getLatestPoliceFraudInterdictionStats(),
    getLatestFscFraudAdStats(),
  ]);

  return (
    <ToolPageShell slug="anti-fraud" title={catalogEntry.title}>
      <div className="space-y-8">
        <AntiFraudChecker />
        <FraudTrendsSection
          fraudDomains={fraudDomainsTrend}
          policeStats={policeStats}
          fscStats={fscStats}
        />
        <FraudMethodsGuide />
        <FraudHotlineLinks />
      </div>
    </ToolPageShell>
  );
}
