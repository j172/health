import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import LatestBooksContent from "@/components/LatestBooks/LatestBooksContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/latest-books`;
const catalogEntry = getToolCatalogEntry("latest-books");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "最新書籍",
    "博客來暢銷榜",
    "誠品選書",
    "醫療保健書籍",
    "心理勵志書籍",
    "親子教養書籍",
    "飲食料理食譜",
    "長照熟齡好書",
    "寵物照護書單",
  ],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function LatestBooksPage() {
  return (
    <ToolPageShell slug="latest-books" title={catalogEntry.title} maxWidthClassName="max-w-6xl">
      <LatestBooksContent />
    </ToolPageShell>
  );
}
