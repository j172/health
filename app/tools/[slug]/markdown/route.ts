import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { buildToolLlmsPageContent } from "@/lib/server/content/toolLlmsPage";
import { buildLlmsMarkdown } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-tool-page clean full-text Markdown (issue #444) — no navigation,
 * footer, or script content, built straight from the same TOOL_CATALOG
 * entry `/tools/<slug>/llms.txt` and the HTML page itself both use. See
 * `app/tools/[slug]/llms.txt/route.ts` for why this dynamic `[slug]` segment
 * can coexist with every tool's own static directory.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const tool = TOOL_CATALOG.find((t) => t.slug === slug);
  if (!tool) {
    return new Response("Not found", { status: 404 });
  }

  const content = buildToolLlmsPageContent(tool, getBaseUrl());
  return new Response(buildLlmsMarkdown(content), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
