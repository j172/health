import type { GuidePageModel } from "@/lib/server/tools/navModel";
import type { LlmsPageContent, LlmsPageLink, LlmsPageSection } from "./llmsPage";
import type { PathLocale } from "@/lib/i18n/dictionary";
import { getLocalizedGuideMeta, type TranslatedGuideSlug } from "@/lib/i18n/guideContent";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildLocalizedPath, isTranslatedPath, isTranslatedToolSlug } from "@/lib/i18n/translatedPages";

/**
 * Builds the shared `LlmsPageContent` shape for a `/guides/<slug>` hub page
 * (issue #465, following the same adapter convention as
 * `lib/server/content/toolLlmsPage.ts` from issue #444) — from exactly the
 * same `GuidePageModel` fields the hub page itself renders
 * (`buildGuide(slug)`'s resolved `steps[].{tool, href, caption, why}` and
 * `faqs`), never a second, independently maintained copy of the guide's
 * content.
 *
 * Each step's resolved tool becomes a "related page" entry (llms.txt's
 * concise index has no dedicated "steps" section of its own — a guide's
 * steps *are* its related pages, in order), while the full Markdown
 * rendering additionally gets an ordered "情境步驟" section spelling out each
 * step's caption + why-this-step explanation, which llms.txt intentionally
 * omits to stay a short index per llmstxt.org's convention.
 */
export function buildGuideLlmsPageContent(
  guide: GuidePageModel,
  baseUrl: string,
): LlmsPageContent {
  const url = `${baseUrl}/guides/${guide.slug}`;

  const related: LlmsPageLink[] = guide.steps.map((step) => ({
    title: step.tool.navLabel ?? step.tool.title,
    url: `${baseUrl}${step.href}`,
    note: step.caption,
  }));

  const sections: LlmsPageSection[] = [
    {
      heading: "情境步驟 (Guide Steps)",
      paragraphs: guide.steps.map(
        (step, index) =>
          `${index + 1}. **${step.caption}**（${baseUrl}${step.href}）\n   ${step.why}`,
      ),
    },
  ];

  return {
    title: guide.title,
    url,
    summary: guide.description,
    related,
    faqs: guide.faqs,
    sections,
  };
}

const GUIDE_STEPS_HEADING: Record<PathLocale, string> = {
  en: "Guide Steps",
  ja: "ガイドの手順",
  ko: "가이드 단계",
};

/**
 * Locale-aware twin of `buildGuideLlmsPageContent` (issue #488, parent #438
 * §Q/§S) — builds the `LlmsPageContent` for a `/{locale}/guides/<slug>` hub
 * page from exactly the full translation `getLocalizedGuideMeta` holds (same
 * source app/[locale]/guides/typhoon-earthquake/page.tsx itself reads from),
 * never an abbreviated summary. Each step's resolved tool link follows the
 * same "linked content that isn't itself translated yet stays on the real
 * zh page with its zh label" rule that page's own `resolveStepHref`/
 * `resolveStepToolLabel` helpers already apply — including issue #590's
 * `hrefOverride` + `isTranslatedPath` precedence (see that page's doc
 * comment) for steps whose real content moved to a nested sub-route.
 */
export function buildLocaleGuideLlmsPageContent(
  guide: GuidePageModel,
  slug: TranslatedGuideSlug,
  locale: PathLocale,
  baseUrl: string,
): LlmsPageContent {
  const meta = getLocalizedGuideMeta(slug, locale);
  const url = `${baseUrl}${buildLocalizedPath(`/guides/${guide.slug}`, locale)}`;

  const stepHref = (step: GuidePageModel["steps"][number]): string => {
    const canonicalPath = step.hrefOverride ?? `/tools/${step.toolSlug}`;
    return isTranslatedPath(canonicalPath) ? buildLocalizedPath(canonicalPath, locale) : canonicalPath;
  };
  const stepToolTitle = (step: GuidePageModel["steps"][number]): string =>
    isTranslatedToolSlug(step.toolSlug)
      ? getLocalizedToolMeta(step.toolSlug, locale).title
      : step.tool.navLabel ?? step.tool.title;

  const related: LlmsPageLink[] = guide.steps.map((step) => {
    const localizedStep = meta.steps[step.toolSlug];
    return {
      title: stepToolTitle(step),
      url: `${baseUrl}${stepHref(step)}`,
      note: localizedStep?.caption ?? step.caption,
    };
  });

  const sections: LlmsPageSection[] = [
    {
      heading: GUIDE_STEPS_HEADING[locale],
      paragraphs: guide.steps.map((step, index) => {
        const localizedStep = meta.steps[step.toolSlug];
        const caption = localizedStep?.caption ?? step.caption;
        const why = localizedStep?.why ?? step.why;
        return `${index + 1}. **${caption}** (${baseUrl}${stepHref(step)})\n   ${why}`;
      }),
    },
  ];

  return {
    title: meta.title,
    url,
    summary: meta.description,
    related,
    faqs: meta.faqs,
    sections,
  };
}
