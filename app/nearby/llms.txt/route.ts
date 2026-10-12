import { buildNearbyLlmsPageContent } from "@/lib/server/content/nearbyContent";
import { buildLlmsTxt } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /nearby's llms.txt (https://llmstxt.org/) — issue #466. */
export async function GET(): Promise<Response> {
  const content = buildNearbyLlmsPageContent(getBaseUrl());
  return new Response(buildLlmsTxt(content), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400",
    },
  });
}
