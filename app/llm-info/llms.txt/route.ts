import { buildLlmInfoLlmsPageContent } from "@/lib/server/content/llmInfoContent";
import { buildLlmsTxt } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /llm-info's own page-level llms.txt (https://llmstxt.org/) — issue #444.
 * Distinct from the site-wide /llms.txt (app/llms.txt/route.ts). */
export async function GET(): Promise<Response> {
  const content = buildLlmInfoLlmsPageContent(getBaseUrl());
  return new Response(buildLlmsTxt(content), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
