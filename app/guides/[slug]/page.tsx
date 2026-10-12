import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildGuideGraphJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import { GUIDES, buildGuide } from "@/lib/server/tools/navModel";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";

// StabloHeader renders a live DB-backed weather-alert bar (same reason every
// /tools/<slug> and /tools/category/<slug> page sets this), so this route
// can't be fully statically prerendered either.
export const revalidate = 300;
export const runtime = "nodejs";

/**
 * Pre-renders all 5 known guide slugs at build time. An unknown slug still
 * resolves (dynamicParams defaults to true) and falls through to notFound()
 * below, instead of 404ing before even reaching the page.
 */
export async function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = buildGuide(slug);
  if (!guide) {
    return {};
  }

  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}/guides/${guide.slug}`;

  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "website",
      title: `${guide.title} | ${SITE_NAME}`,
      description: guide.description,
      url: canonical,
      siteName: SITE_NAME,
      locale: "zh_TW",
    },
    twitter: {
      card: "summary",
      title: `${guide.title} | ${SITE_NAME}`,
      description: guide.description,
    },
  };
}

/**
 * `/guides/[slug]` hub page (issue #465). Renders one guide's ordered
 * `steps[]` as a sequence of cards, each linking to the step's real
 * `/tools/<slug>` page with the step's `caption` as the card title and `why`
 * as the "為什麼這一步" explanation (acceptance criterion 2), a structured
 * HowTo/ItemList/FAQPage JSON-LD graph (criterion 3, `buildGuideGraphJsonLd`
 * — see issue #438 §R), and `<link rel="alternate">` tags to this guide's own
 * `llms.txt`/`markdown` sibling routes (criterion 4).
 *
 * `buildGuide(slug)` resolves every step's `toolSlug` against the live
 * `TOOL_CATALOG` and throws if one doesn't exist — already covered by
 * issue #443's own test suite, so this page only needs to handle
 * `buildGuide` returning `null` for an unknown *guide* slug.
 */
export default async function GuideHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = buildGuide(slug);
  if (!guide) {
    notFound();
  }

  const guideGraph = buildGuideGraphJsonLd(guide);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(guideGraph) }}
      />
      {/* Machine-readable sibling versions of this specific guide page
       * (issue #465, following issue #444's established per-page llms.txt +
       * clean Markdown convention) — built from this same GuidePageModel via
       * lib/server/content/guideLlmsPage.ts. */}
      <link rel="alternate" type="text/plain" title={`${guide.title} - LLM Index (llms.txt)`} href={`/guides/${guide.slug}/llms.txt`} />
      <link rel="alternate" type="text/markdown" title={`${guide.title} - Clean Markdown`} href={`/guides/${guide.slug}/markdown`} />

      <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <StabloHeader />

        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          {/* Breadcrumb navigation: 首頁 / 生活情境 / {guide.title} */}
          <nav className="mb-6 text-xs font-medium text-slate-600 dark:text-slate-400" aria-label="breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  首頁
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li>
                <Link href="/guides" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  生活情境
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li aria-current="page" className="font-semibold text-slate-700 dark:text-slate-300">
                {guide.title}
              </li>
            </ol>
          </nav>

          <section className="mb-10">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
              {guide.title}
            </h1>
            <p
              id="guide-direct-answer"
              className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400"
            >
              {guide.description}
            </p>
          </section>

          {/* Ordered step-by-step cards (GOV.UK step-by-step pattern) — each
           * links to the step's real tool page and explains "為什麼這一步". */}
          <ol className="space-y-4">
            {guide.steps.map((step, index) => (
              <li key={step.toolSlug}>
                <Link
                  href={step.href}
                  className="group flex gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
                >
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                      {step.caption}
                    </h2>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {step.why}
                    </p>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs font-semibold text-slate-700 group-hover:text-indigo-600 dark:border-slate-800 dark:text-slate-300 dark:group-hover:text-indigo-400">
                      <span>{step.tool.navLabel ?? step.tool.title}</span>
                      <span className="transition-transform duration-200 group-hover:translate-x-1">
                        前往工具 →
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>

          {/* Structured Frequently Asked Questions (FAQ Section) */}
          {guide.faqs.length > 0 ? (
            <section
              className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900"
              aria-labelledby="guide-faq-heading"
            >
              <h2 id="guide-faq-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>❓</span>
                <span>常見問題解答 (FAQ)</span>
              </h2>
              <dl className="mt-4 space-y-4">
                {guide.faqs.map((faq) => (
                  <div key={faq.question} className="rounded-xl bg-slate-50/75 p-4 dark:bg-slate-850">
                    <dt className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                      Q: {faq.question}
                    </dt>
                    <dd className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      A: {faq.answer}
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
