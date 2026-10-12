import type { Metadata } from "next";
import { getBaseUrl, buildLlmInfoGraphJsonLd, SITE_NAME } from "@/lib/server/news/seo";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { LLM_INFO_SUMMARY, LLM_INFO_TITLE } from "@/lib/server/content/llmInfoContent";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import LlmInfoClient, { type SerializedTool } from "./LlmInfoClient";

export const revalidate = 3600;
export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}/llm-info`;
  const title = `${LLM_INFO_TITLE} | Official LLM Profile`;
  const description = LLM_INFO_SUMMARY;

  return {
    title,
    description,
    alternates: { canonical },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: "zh_TW",
      alternateLocale: ["en_US"],
      images: [{ url: `${baseUrl}/images/og/home.png`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${baseUrl}/images/og/home.png`],
    },
  };
}

export default async function LlmInfoPage() {
  const baseUrl = getBaseUrl();
  const jsonLd = buildLlmInfoGraphJsonLd();

  const serializedTools: SerializedTool[] = TOOL_CATALOG.map((tool) => ({
    slug: tool.slug,
    title: tool.title,
    group: tool.group,
    description: tool.description,
    directAnswer: tool.directAnswer,
    formula: tool.formula,
    scientificBasis: tool.scientificBasis.map((sb) => ({
      title: sb.title,
      authority: sb.authority,
      url: sb.url,
    })),
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Machine-readable sibling versions of this page (issue #444), built
       * from the exact same TOOL_CATALOG/TOOL_GROUP_META data serialized
       * above via lib/server/content/llmInfoContent.ts. Distinct from the
       * site-wide /llms.txt and /llms-full.txt this page links to below —
       * these describe this one page. */}
      <link rel="alternate" type="text/plain" title={`${LLM_INFO_TITLE} - LLM Index (llms.txt)`} href="/llm-info/llms.txt" />
      <link rel="alternate" type="text/markdown" title={`${LLM_INFO_TITLE} - Clean Markdown`} href="/llm-info/markdown" />
      <div className="min-h-screen bg-slate-50/50 text-slate-800 transition-colors dark:bg-slate-950 dark:text-slate-100">
        <StabloHeader />
        <main className="pb-16">
          <LlmInfoClient baseUrl={baseUrl} tools={serializedTools} />
        </main>
        <StabloFooter />
      </div>
    </>
  );
}
