import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildGuideGraphJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import { buildGuide } from "@/lib/server/tools/navModel";
import { getActiveMetroAlertsCount } from "@/lib/server/metroAlerts/queries";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import { isPathLocale, ogAlternateLocales, OG_LOCALE, getDictionary, type PathLocale } from "@/lib/i18n/dictionary";
import { getLocalizedGuideMeta } from "@/lib/i18n/guideContent";
import { isTranslatedToolSlug } from "@/lib/i18n/translatedPages";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

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
 * step still links to its real `/tools/<toolSlug>` tool page: when that
 * tool is itself translated (today: "emergency-hotlines"), the link and its
 * footer label go to the localized `/{locale}/tools/<slug>` page; when it
 * isn't (e.g. "weather-alerts", "earthquakes" — not yet translated by any
 * ticket), the link stays on the real zh page with its zh label, the same
 * "linked content that isn't itself translated yet stays Chinese" rule
 * ToolPageShell's own "下一步"/"所屬生活情境指南" sections already follow.
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

function resolveStepHref(toolSlug: string, locale: PathLocale): string {
  return isTranslatedToolSlug(toolSlug) ? buildLocalizedPath(`/tools/${toolSlug}`, locale) : `/tools/${toolSlug}`;
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
  const guideGraph = buildGuideGraphJsonLd(localizedGuideForGraph);

  const hasMetroAlertsStep = guide.steps.some((step) => step.toolSlug === "metro-alerts");
  const activeMetroAlertsCount = hasMetroAlertsStep ? await getActiveMetroAlertsCount() : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(guideGraph) }} />

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
              const href = resolveStepHref(step.toolSlug, locale);
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
                      {step.toolSlug === "metro-alerts" && activeMetroAlertsCount !== null ? (
                        <div
                          className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            activeMetroAlertsCount > 0
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                          }`}
                        >
                          <span>{activeMetroAlertsCount > 0 ? "⚠️" : "🟢"}</span>
                          <span>
                            {activeMetroAlertsCount > 0
                              ? t("guidePage.metroAlertActiveTemplate", "目前全台有 {count} 則軌道通阻公告").replace(
                                  "{count}",
                                  String(activeMetroAlertsCount),
                                )
                              : t("guidePage.metroAlertClear", "目前全台軌道系統運作正常，無通阻公告")}
                          </span>
                        </div>
                      ) : null}
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
