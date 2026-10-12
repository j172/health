import { GUIDES, buildGuide } from "@/lib/server/tools/navModel";
import { buildGuideLlmsPageContent } from "@/lib/server/content/guideLlmsPage";
import { buildLlmsMarkdown } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-guide-hub-page clean full-text Markdown (issue #465) — no navigation,
 * footer, or script content, built straight from the same `GuidePageModel`
 * `/guides/<slug>/llms.txt` and the HTML hub page itself both use. See
 * `app/guides/[slug]/llms.txt/route.ts` for why this dynamic `[slug]`
 * segment needs no fallback-behind-static-directory handling, unlike
 * `app/tools/[slug]/markdown/route.ts`.
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
  return new Response(buildLlmsMarkdown(content), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
