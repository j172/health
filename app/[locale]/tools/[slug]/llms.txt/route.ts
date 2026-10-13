import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { buildLocaleToolLlmsPageContent } from "@/lib/server/content/toolLlmsPage";
import { buildLlmsTxt } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";
import { isPathLocale } from "@/lib/i18n/dictionary";
import { isTranslatedToolSlug } from "@/lib/i18n/translatedPages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Locale-aware per-tool-page llms.txt (https://llmstxt.org/) — issue #488,
 * extending issue #444's `/tools/<slug>/llms.txt` pattern one level into the
 * `/en//ja//ko/` tree, mirroring `app/(zh)/tools/[slug]/llms.txt/route.ts`'s
 * own "static directory + dynamic `[slug]` sibling fallback" shape (an exact
 * match like `/en/tools/aed` resolves to that static page.tsx; the
 * `/llms.txt` sub-path has no static sibling and falls through here).
 *
 * 404s for any slug not in `TRANSLATED_TOOL_SLUGS`, since
 * `app/[locale]/tools/<slug>/page.tsx` itself only exists for those — this
 * route must never claim a machine-readable version exists for a page that
 * doesn't.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> },
): Promise<Response> {
  const { locale, slug } = await params;
  if (!isPathLocale(locale) || !isTranslatedToolSlug(slug)) {
    return new Response("Not found", { status: 404 });
  }

  const tool = TOOL_CATALOG.find((t) => t.slug === slug);
  if (!tool) {
    return new Response("Not found", { status: 404 });
  }

  const content = buildLocaleToolLlmsPageContent(tool, locale, getBaseUrl());
  return new Response(buildLlmsTxt(content, locale), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
