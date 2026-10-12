import { getNewsById } from "@/lib/server/news/queries";
import { buildNewsLlmsPageContent } from "@/lib/server/content/newsLlmsPage";
import { buildLlmsTxt } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-article llms.txt (https://llmstxt.org/) — issue #444, gated to
 * official (government-source) articles only. A non-official source, or any
 * id with no matching row, responds 404 rather than generating a
 * machine-readable page for syndicated third-party content this site has no
 * rights/authority to represent as its own (see
 * lib/server/content/newsLlmsPage.ts).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return new Response("Not found", { status: 404 });
  }

  const news = await getNewsById(numericId);
  if (!news) {
    return new Response("Not found", { status: 404 });
  }

  const content = buildNewsLlmsPageContent(news, getBaseUrl());
  if (!content) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(buildLlmsTxt(content), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
