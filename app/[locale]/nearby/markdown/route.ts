import { buildLocaleNearbyLlmsPageContent } from "@/lib/server/content/nearbyContent";
import { buildLlmsMarkdown } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";
import { isPathLocale } from "@/lib/i18n/dictionary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Locale-aware "/nearby" clean full-text Markdown (issue #488). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale } = await params;
  if (!isPathLocale(locale)) {
    return new Response("Not found", { status: 404 });
  }

  const content = buildLocaleNearbyLlmsPageContent(locale, getBaseUrl());
  return new Response(buildLlmsMarkdown(content, locale), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400",
    },
  });
}
