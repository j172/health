import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { buildToolLlmsPageContent } from "@/lib/server/content/toolLlmsPage";
import { buildLlmsTxt } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-tool-page llms.txt (https://llmstxt.org/) — issue #444. Lives alongside
 * every static `/tools/<slug>` directory via Next.js's dynamic-segment
 * fallback (the same mixing pattern issue #459's
 * `app/tools/category/[slug]/page.tsx` already relies on): an exact static
 * match like `/tools/bmi` resolves to that tool's own `page.tsx`, while
 * `/tools/bmi/llms.txt` has no static sibling at that sub-path and falls
 * through to this `[slug]` route with `slug = "bmi"`.
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
  return new Response(buildLlmsTxt(content), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
