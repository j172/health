import { buildPrivacyLlmsPageContent } from "@/lib/server/content/privacyContent";
import { buildLlmsMarkdown } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /privacy's clean full-text Markdown (issue #444). */
export async function GET(): Promise<Response> {
  const content = buildPrivacyLlmsPageContent(getBaseUrl());
  return new Response(buildLlmsMarkdown(content), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400",
    },
  });
}
