import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import SocialWelfareCentersContent, { type SocialWelfareCenter } from "@/components/Tools/SocialWelfareCentersContent";
import { countFacilities, searchFacilities } from "@/lib/server/facilities/queries";

export const revalidate = 3600;
export const runtime = "nodejs";

const slug = "social-welfare-centers";
const canonical = `${getBaseUrl()}/tools/${slug}`;
const catalogEntry = getToolCatalogEntry(slug);

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: catalogEntry.keywords,
  alternates: { canonical },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

/**
 * Reads the bundled seed (the real 160903 dataset, pre-fetched at build
 * time — see data/facilities-seeds/social_welfare_center.json) as a
 * fallback for when the DB has no rows yet (this facility type is a
 * manual-only MOHW source, see lib/server/facilities/sources/
 * mohwSocialWelfareCenter.ts — nothing populates it automatically) or when
 * the DB is temporarily unreachable.
 */
function readSeedCenters(): SocialWelfareCenter[] {
  try {
    const seedPath = path.join(process.cwd(), "data", "facilities-seeds", "social_welfare_center.json");
    if (!fs.existsSync(seedPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
    const list = Array.isArray(parsed) ? parsed : [];
    return list.map((item: any) => ({
      name: item.name,
      address: item.address ?? null,
      phone: item.phone ?? null,
      serviceArea: item.service_item ?? null,
    }));
  } catch (err) {
    console.warn("Failed to read social_welfare_center.json seed:", err);
    return [];
  }
}

/**
 * Loads the full nationwide list (~156-158 rows — small enough to embed in
 * the page's own SSR output once, rather than have the client fetch it) so
 * the client component below can do every county/district match fully
 * in-browser with zero follow-up network calls — deliberate, given this
 * page's privacy requirements (issue #603): a per-keystroke search request
 * to any API would otherwise leak what district/scenario a visitor is
 * looking up to the server's access logs.
 */
async function getCenters(): Promise<SocialWelfareCenter[]> {
  try {
    const total = await countFacilities("social_welfare_center");
    if (total > 0) {
      const rows = await searchFacilities({ facilityType: "social_welfare_center", limit: 500 });
      return rows.map((r) => ({
        name: r.name,
        address: r.address,
        phone: r.phone,
        serviceArea: r.service_item,
      }));
    }
  } catch (err) {
    console.warn("GET social_welfare_center facilities failed, falling back to bundled seed:", err);
  }
  return readSeedCenters();
}

export default async function SocialWelfareCentersPage() {
  const centers = await getCenters();

  return (
    <ToolPageShell slug={slug} title={catalogEntry.title} maxWidthClassName="max-w-4xl" skipRecentToolTracking>
      <SocialWelfareCentersContent centers={centers} />
    </ToolPageShell>
  );
}
