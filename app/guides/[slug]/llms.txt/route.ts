import { GUIDES, buildGuide } from "@/lib/server/tools/navModel";
import { buildGuideLlmsPageContent } from "@/lib/server/content/guideLlmsPage";
import { buildLlmsTxt } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-guide-hub-page llms.txt (https://llmstxt.org/) — issue #465, following
 * issue #444's established per-page llms.txt + clean Markdown convention.
 * `[slug]` has no static sibling directory to conflict with (every
 * `/guides/<slug>` hub is itself served by this one dynamic route), unlike
 * `app/tools/[slug]/llms.txt/route.ts`'s fallback-behind-static-directories
 * setup — so this file simply 404s for any slug not in `GUIDES`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const guideExists = GUIDES.some((g) => g.slug === slug);
  if (!guideExists) {
    return new Response("Not found", { status: 404 });
  }

  const guide = buildGuide(slug);
  if (!guide) {
    return new Response("Not found", { status: 404 });
  }

  const content = buildGuideLlmsPageContent(guide, getBaseUrl());
  return new Response(buildLlmsTxt(content), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
