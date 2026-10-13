import { buildNearbyLlmsPageContent } from "@/lib/server/content/nearbyContent";
import { buildLlmsMarkdown } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /nearby's clean full-text Markdown (issue #466). */
export async function GET(): Promise<Response> {
  const content = buildNearbyLlmsPageContent(getBaseUrl());
  return new Response(buildLlmsMarkdown(content), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400",
    },
  });
}
