import { buildLocaleHomeLlmsPageContent } from "@/lib/server/content/homeLlmsPage";
import { buildLlmsTxt } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";
import { isPathLocale } from "@/lib/i18n/dictionary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Locale-aware homepage llms.txt (https://llmstxt.org/) — issue #488,
 * parent #438 §Q/§S. The zh homepage has no per-page llms.txt of its own
 * (see `app/llms.txt/route.ts`'s sitewide index instead); this one is
 * scoped to exactly the pages that actually exist in `locale` today — see
 * `lib/server/content/homeLlmsPage.ts`'s own doc comment for why.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale } = await params;
  if (!isPathLocale(locale)) {
    return new Response("Not found", { status: 404 });
  }

  const content = buildLocaleHomeLlmsPageContent(locale, getBaseUrl());
  return new Response(buildLlmsTxt(content, locale), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
