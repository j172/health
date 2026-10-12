import type { GuidePageModel } from "@/lib/server/tools/navModel";
import type { LlmsPageContent, LlmsPageLink, LlmsPageSection } from "./llmsPage";

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
