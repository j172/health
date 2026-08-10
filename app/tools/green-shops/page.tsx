import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/green-shops`;
const catalogEntry = getToolCatalogEntry("green-shops");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["綠色商店", "環境部認證", "綠色採購"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

// Placeholder only — real data/search UI lands in Phase 3
// (docs/specs/phase3-green-shops.md), which replaces this body with
// FacilitySearchContent the same way every other /tools/<slug> page uses it.
// Kept here so the new 綠色商店 nav/footer links resolve instead of 404ing
// in between the two phases' merges.
export default function GreenShopsPage() {
  return (
    <ToolPageShell slug="green-shops" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">🌱 {catalogEntry.title}</h1>
        <p className="text-neutral-600">{catalogEntry.description}</p>
      </div>

      <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 px-6 py-10 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-lg font-semibold text-neutral-700 dark:text-neutral-200">功能即將推出</p>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          綠色商店查詢工具正在建置中，敬請期待。
        </p>
      </div>
    </ToolPageShell>
  );
}
