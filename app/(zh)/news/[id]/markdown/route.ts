import { getNewsById } from "@/lib/server/news/queries";
import { buildNewsLlmsPageContent } from "@/lib/server/content/newsLlmsPage";
import { buildLlmsMarkdown } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-article clean full-text Markdown (issue #444) — same official-source
 * gating as `app/news/[id]/llms.txt/route.ts`; a non-official source
 * responds 404.
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

  return new Response(buildLlmsMarkdown(content), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
