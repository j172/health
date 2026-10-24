import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildGuideGraphJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import { buildGuide } from "@/lib/server/tools/navModel";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import { isPathLocale, ogAlternateLocales, OG_LOCALE, getDictionary, type PathLocale } from "@/lib/i18n/dictionary";
import { getLocalizedGuideMeta } from "@/lib/i18n/guideContent";
import { isTranslatedToolSlug, isTranslatedPath } from "@/lib/i18n/translatedPages";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";
import type { GuideStepModel } from "@/lib/server/tools/navModel";
import TransitSuspensionSection from "@/components/Tools/TransitSuspensionSection";

/**
 * Issue #487 — locale-aware twin of app/(zh)/guides/[slug]/page.tsx, scoped
 * to exactly the one translated guide ("typhoon-earthquake" — see
 * TRANSLATED_GUIDE_SLUGS in lib/i18n/guideContent.ts), not a `[slug]`
 * dynamic route: only this guide has real en/ja/ko content today, and a
 * `[slug]` route would need to notFound() for the other 4 anyway, so a
 * fixed path keeps that guardrail at the filesystem level (same reasoning
 * as app/[locale]/tools/<slug>/page.tsx existing per-slug instead of as a
 * catch-all).
 *
 * The acceptance criteria require this guide's foreign-language version to
 * be exactly as complete as the Chinese one, not an abbreviated summary —
 * so every one of the 8 steps' caption/why and all 3 FAQs are rendered from
 * lib/i18n/guideContent.ts's full translation, not a trimmed subset. Each
 * step links to its real tool page — `resolveStepHref` resolves
 * `step.hrefOverride ?? /tools/<toolSlug>` (same precedence as
 * navModel.ts's `buildGuide`) via `isTranslatedPath` rather than
 * `isTranslatedToolSlug` alone, since issue #590 gave the "earthquakes" step
 * a `hrefOverride` pointing at a nested, itself-translated sub-route
 * ("/tools/global-watch/earthquakes") rather than a flat `/tools/<slug>`
 * page. When the resolved canonical path isn't translated (today:
 * "weather-alerts"), the link stays on the real zh page with its zh label,
 * the same "linked content that isn't itself translated yet stays Chinese"
 * rule ToolPageShell's own "下一步"/"所屬生活情境指南" sections already follow.
 */

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const GUIDE_SLUG = "typhoon-earthquake";
const CANONICAL_PATH = `/guides/${GUIDE_SLUG}`;

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedGuideMeta(GUIDE_SLUG, locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical, languages },
    openGraph: {
      type: "website",
      title: `${meta.title} | ${SITE_NAME}`,
      description: meta.description,
      url: canonical,
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale],
      alternateLocale: ogAlternateLocales(locale),
    },
    twitter: {
      card: "summary",
      title: `${meta.title} | ${SITE_NAME}`,
      description: meta.description,
    },
  };
}

function resolveStepHref(step: Pick<GuideStepModel, "toolSlug" | "hrefOverride">, locale: PathLocale): string {
  const canonicalPath = step.hrefOverride ?? `/tools/${step.toolSlug}`;
  return isTranslatedPath(canonicalPath) ? buildLocalizedPath(canonicalPath, locale) : canonicalPath;
}

function resolveStepToolLabel(toolSlug: string, locale: PathLocale, fallbackLabel: string): string {
  return isTranslatedToolSlug(toolSlug) ? getLocalizedToolMeta(toolSlug, locale).title : fallbackLabel;
}

export default async function LocaleTyphoonEarthquakeGuidePage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();

  const guide = buildGuide(GUIDE_SLUG);
  if (!guide) notFound();

  const meta = getLocalizedGuideMeta(GUIDE_SLUG, locale);
  const { t } = getDictionary(locale);

  // Same JSON-LD graph the zh hub page builds, but from the localized
  // title/description/steps/faqs — a crawler on this locale must never see
  // English/Japanese/Korean visible text paired with Chinese structured data.
  const localizedGuideForGraph = {
    ...guide,
    title: meta.title,
    description: meta.description,
    faqs: meta.faqs,
    steps: guide.steps.map((step) => ({
      ...step,
      caption: meta.steps[step.toolSlug]?.caption ?? step.caption,
      why: meta.steps[step.toolSlug]?.why ?? step.why,
    })),
  };
  // Issue #438 §R "外語版": locale-prefixed URL, `inLanguage` and
  // `translationOfWork` back to the zh hub page.
  const guideGraph = buildGuideGraphJsonLd(localizedGuideForGraph, { locale });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(guideGraph) }} />
      {/* Machine-readable sibling versions of this locale's guide hub page
       * (issue #488, extending issue #465's zh-only pattern) — built from
       * the full getLocalizedGuideMeta translation this page itself renders
       * from, via lib/server/content/guideLlmsPage.ts's
       * buildLocaleGuideLlmsPageContent. */}
      <link
        rel="alternate"
        type="text/plain"
        title={`${meta.title} - LLM Index (llms.txt)`}
        href={`${buildLocalizedPath(CANONICAL_PATH, locale)}/llms.txt`}
      />
      <link
        rel="alternate"
        type="text/markdown"
        title={`${meta.title} - Clean Markdown`}
        href={`${buildLocalizedPath(CANONICAL_PATH, locale)}/markdown`}
      />

      <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <StabloHeader />

        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <nav className="mb-6 text-xs font-medium text-slate-600 dark:text-slate-400" aria-label="breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  {t("toolShell.home", "首頁")}
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li>
                {/* issue #487: /guides (the all-guides index) isn't itself
                    translated by this ticket, so this breadcrumb level
                    stays on the real zh page rather than a /{locale}/guides
                    URL that would 404 — same rule app/[locale]/tools/<slug>
                    uses for its "首頁"/"工具" index breadcrumb levels. */}
                <Link href="/guides" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  {t("guidePage.breadcrumbGuidesIndex", "生活情境")}
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li aria-current="page" className="font-semibold text-slate-700 dark:text-slate-300">
                {meta.title}
              </li>
            </ol>

          </nav>

          <section className="mb-10">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
              {meta.title}
            </h1>
            <p
              id="guide-direct-answer"
              className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400"
            >
              {meta.description}
            </p>
          </section>

          <ol className="space-y-4">
            {guide.steps.map((step, index) => {
              const localizedStep = meta.steps[step.toolSlug];
              const href = resolveStepHref(step, locale);
              const toolLabel = resolveStepToolLabel(step.toolSlug, locale, step.tool.navLabel ?? step.tool.title);
              return (
                <li key={step.toolSlug}>
                  <Link
                    href={href}
                    className="group flex gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
                  >
                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                        {localizedStep?.caption ?? step.caption}
                      </h2>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {localizedStep?.why ?? step.why}
                      </p>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs font-semibold text-slate-700 group-hover:text-indigo-600 dark:border-slate-800 dark:text-slate-300 dark:group-hover:text-indigo-400">
                        <span>{toolLabel}</span>
                        <span className="transition-transform duration-200 group-hover:translate-x-1">
                          {t("guidePage.goToToolLink", "前往工具 →")}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>

          <TransitSuspensionSection locale={locale} />

          {meta.faqs.length > 0 ? (
            <section
              className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900"
              aria-labelledby="guide-faq-heading"
            >
              <h2 id="guide-faq-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>❓</span>
                <span>{t("toolShell.faqHeading", "常見問題解答 (FAQ)")}</span>
              </h2>
              <dl className="mt-4 space-y-4">
                {meta.faqs.map((faq) => (
                  <div key={faq.question} className="rounded-xl bg-slate-50/75 p-4 dark:bg-slate-850">
                    <dt className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                      {t("toolShell.faqQLabel", "Q:")} {faq.question}
                    </dt>
                    <dd className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {t("toolShell.faqALabel", "A:")} {faq.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
