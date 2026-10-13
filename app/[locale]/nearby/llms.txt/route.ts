import { buildLocaleNearbyLlmsPageContent } from "@/lib/server/content/nearbyContent";
import { buildLlmsTxt } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";
import { isPathLocale } from "@/lib/i18n/dictionary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Locale-aware "/nearby" llms.txt (https://llmstxt.org/) — issue #488,
 * extending issue #466's `app/(zh)/nearby/llms.txt/route.ts` one level into
 * the `/en//ja//ko/` tree.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale } = await params;
  if (!isPathLocale(locale)) {
    return new Response("Not found", { status: 404 });
  }

  const content = buildLocaleNearbyLlmsPageContent(locale, getBaseUrl());
  return new Response(buildLlmsTxt(content, locale), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400",
    },
  });
}
