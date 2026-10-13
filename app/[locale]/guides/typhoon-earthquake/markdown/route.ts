import { buildGuide } from "@/lib/server/tools/navModel";
import { buildLocaleGuideLlmsPageContent } from "@/lib/server/content/guideLlmsPage";
import { buildLlmsMarkdown } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";
import { isPathLocale } from "@/lib/i18n/dictionary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUIDE_SLUG = "typhoon-earthquake";

/** Locale-aware "typhoon-earthquake" guide clean full-text Markdown (issue #488). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale } = await params;
  if (!isPathLocale(locale)) {
    return new Response("Not found", { status: 404 });
  }

  const guide = buildGuide(GUIDE_SLUG);
  if (!guide) {
    return new Response("Not found", { status: 404 });
  }

  const content = buildLocaleGuideLlmsPageContent(guide, GUIDE_SLUG, locale, getBaseUrl());
  return new Response(buildLlmsMarkdown(content, locale), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
