import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { readSeedJson } from "@/lib/server/db/transientSeed";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import ChildSubsidiesContent from "@/components/Tools/ChildSubsidiesContent";
import type { ChildSubsidyRule, PolicyWatchItem } from "@/lib/server/childSubsidies/types";

export const revalidate = 3600;
export const runtime = "nodejs";

const slug = "child-subsidies";
const baseUrl = getBaseUrl();
const canonical = `${baseUrl}/tools/${slug}`;
const catalogEntry = getToolCatalogEntry(slug);

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: catalogEntry.keywords,
  alternates: { canonical },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

/**
 * Reads the two hand-maintained data files directly from disk — this tool
 * does NOT go through the facility-sync pipeline, same pattern as
 * `data/government-hotlines.json` → `EmergencyHotlinesContent` (see
 * `app/(zh)/tools/emergency-hotlines/page.tsx`). `rules` and `policyWatch`
 * are deliberately two separate files/arrays: `policyWatch` (the 0–18歲
 * 成長津貼 proposals) must never be passed into `matchChildSubsidies`, and
 * keeping it in its own file makes that structurally obvious rather than
 * relying on every future edit to keep filtering it out of one shared array.
 */
function getChildSubsidyRules(): ChildSubsidyRule[] {
  return readSeedJson<ChildSubsidyRule[]>("child-subsidies.json") ?? [];
}

function getPolicyWatchItems(): PolicyWatchItem[] {
  return readSeedJson<PolicyWatchItem[]>("child-subsidies-policy-watch.json") ?? [];
}

export default async function ChildSubsidiesPage() {
  const rules = getChildSubsidyRules();
  const policyWatch = getPolicyWatchItems();

  return (
    <ToolPageShell slug={slug} title={catalogEntry.title} maxWidthClassName="max-w-6xl">
      <ChildSubsidiesContent initialRules={rules} policyWatch={policyWatch} />
    </ToolPageShell>
  );
}
