import { buildGuide } from "@/lib/server/tools/navModel";
import { buildLocaleGuideLlmsPageContent } from "@/lib/server/content/guideLlmsPage";
import { buildLlmsTxt } from "@/lib/server/content/llmsPage";
import { getBaseUrl } from "@/lib/server/news/seo";
import { isPathLocale } from "@/lib/i18n/dictionary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUIDE_SLUG = "typhoon-earthquake";

/**
 * Locale-aware "typhoon-earthquake" guide llms.txt (https://llmstxt.org/) —
 * issue #488, extending issue #465's `app/(zh)/guides/[slug]/llms.txt/route.ts`
 * one level into the `/en//ja//ko/` tree. A fixed path, not a `[slug]`
 * dynamic route — mirroring `app/[locale]/guides/typhoon-earthquake/page.tsx`'s
 * own reasoning: this is the only guide with real translated content today
 * (see `TRANSLATED_GUIDE_SLUGS`), so a dynamic route would just need to
 * 404 every other slug anyway.
 */
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
  return new Response(buildLlmsTxt(content, locale), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
