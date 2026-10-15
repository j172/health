import type { Metadata } from "next";
import Link from "next/link";
import { buildGuidesIndexGraphJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import { GUIDES } from "@/lib/server/tools/navModel";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";

// StabloHeader renders a live DB-backed weather-alert bar (same reason every
// /tools/<slug> and /tools/category/<slug> page sets this), so this route
// can't be fully statically prerendered either.
export const revalidate = 300;
export const runtime = "nodejs";

const baseUrl = getBaseUrl();
const canonical = `${baseUrl}/guides`;
const PAGE_TITLE = "生活情境指南";
const PAGE_DESCRIPTION =
  "家有長輩、懷孕到育兒、颱風地震來了、身心障礙者生活、出國與防疫、遠離詐騙與成癮：6 種生活情境的有序步驟指南，一步步帶你找到對應的公開資料工具。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
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
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: canonical,
    siteName: SITE_NAME,
    locale: "zh_TW",
  },
  twitter: {
    card: "summary",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

/**
 * `/guides` index page (issue #465 acceptance criterion 1: "索引頁列出全部 5
 * 個情境，點進去可以看到完整步驟"). Lists all 5 `GUIDES` entries as cards
 * linking to their own `/guides/[slug]` hub page — the hub pages themselves
 * render each guide's full ordered step sequence.
 */
export default function GuidesIndexPage() {
  const guidesGraph = buildGuidesIndexGraphJsonLd(GUIDES);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(guidesGraph) }}
      />

      <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <StabloHeader />

        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          {/* Breadcrumb navigation: 首頁 / 生活情境 */}
          <nav className="mb-6 text-xs font-medium text-slate-600 dark:text-slate-400" aria-label="breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  首頁
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li aria-current="page" className="font-semibold text-slate-700 dark:text-slate-300">
                生活情境
              </li>
            </ol>
          </nav>

          <section className="mb-10 text-center">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
              {PAGE_TITLE}
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {PAGE_DESCRIPTION}
            </p>
          </section>

          <div className="grid gap-5 sm:grid-cols-2">
            {GUIDES.map((guide) => (
              <Link
                key={guide.slug}
                href={`/guides/${guide.slug}`}
                className="group flex flex-col rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
              >
                <h2 className="text-lg font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                  {guide.title}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {guide.description}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-700 group-hover:text-indigo-600 dark:border-slate-800 dark:text-slate-300 dark:group-hover:text-indigo-400">
                  <span>共 {guide.steps.length} 步驟</span>
                  <span className="transition-transform duration-200 group-hover:translate-x-1">
                    查看完整步驟 →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
