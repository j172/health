import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { buildLocaleToolLlmsPageContent } from "@/lib/server/content/toolLlmsPage";
import { buildLlmsMarkdown } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";
import { isPathLocale } from "@/lib/i18n/dictionary";
import { isTranslatedToolSlug } from "@/lib/i18n/translatedPages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Locale-aware per-tool-page clean full-text Markdown (issue #488) — see
 * `app/[locale]/tools/[slug]/llms.txt/route.ts` for why this dynamic
 * `[slug]` segment can coexist with every translated tool's own static
 * `app/[locale]/tools/<slug>/page.tsx` directory, and why it 404s for any
 * slug outside `TRANSLATED_TOOL_SLUGS`.
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
  return new Response(buildLlmsMarkdown(content, locale), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
