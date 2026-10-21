import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildCategoryPageGraphJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import { TOOL_GROUP_META } from "@/lib/server/tools/catalog";
import { buildCategoryPage, GUIDES } from "@/lib/server/tools/navModel";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";

// StabloHeader renders a live DB-backed weather-alert bar (same reason every
// /tools/<slug> page sets this — see app/tools/bmi/page.tsx), so this route
// can't be fully statically prerendered either.
export const revalidate = 300;
export const runtime = "nodejs";

/**
 * Pre-renders all 7 known category slugs at build time. An unknown slug
 * still resolves (dynamicParams defaults to true) and falls through to
 * notFound() below, instead of 404ing before even reaching the page.
 */
export async function generateStaticParams() {
  return TOOL_GROUP_META.map((meta) => ({ slug: meta.group }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = buildCategoryPage(slug);
  if (!category) {
    return {};
  }

  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}/tools/category/${category.group}`;

  return {
    title: category.label,
    description: category.description,
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
      title: `${category.label} | ${SITE_NAME}`,
      description: category.description,
      url: canonical,
      siteName: SITE_NAME,
      locale: "zh_TW",
    },
    twitter: {
      card: "summary",
      title: `${category.label} | ${SITE_NAME}`,
      description: category.description,
    },
  };
}

export default async function ToolCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = buildCategoryPage(slug);
  if (!category) {
    notFound();
  }

  const categoryGraph = buildCategoryPageGraphJsonLd(category);
  const categoryToolSlugs = new Set(category.tools.map((t) => t.slug));
  const relatedGuides = GUIDES.filter((guide) =>
    guide.steps.some((step) => categoryToolSlugs.has(step.toolSlug)),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(categoryGraph) }}
      />

      <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <StabloHeader />

        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          {/* Breadcrumb navigation: 首頁 / 工具 / {分類} */}
          <nav className="mb-6 text-xs font-medium text-slate-600 dark:text-slate-400" aria-label="breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  首頁
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li>
                <Link href="/tools" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  工具
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li aria-current="page" className="font-semibold text-slate-700 dark:text-slate-300">
                {category.label}
              </li>
            </ol>
          </nav>

          <section className="mb-10">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
              {category.label}
            </h1>
            <p
              id="category-description"
              className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400"
            >
              {category.description}
            </p>
          </section>

          {/* Every tool in this category + a one-line direct answer each. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {category.tools.map((tool) => (
              <Link
                key={tool.slug}
                href={`/tools/${tool.slug}`}
                className="group flex flex-col rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
              >
                <h2 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                  {tool.navLabel ?? tool.title}
                </h2>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {tool.directAnswer}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-700 group-hover:text-indigo-600 dark:border-slate-800 dark:text-slate-300 dark:group-hover:text-indigo-400">
                  <span>立即使用</span>
                  <span className="transition-transform duration-200 group-hover:translate-x-1">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
          {relatedGuides.length > 0 && (
            <section className="mt-12 border-t border-slate-200/80 pt-10 dark:border-slate-800" aria-labelledby="category-related-guides">
              <div className="mb-4 flex items-center justify-between">
                <h2 id="category-related-guides" className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  相關生活情境指南
                </h2>
                <Link
                  href="/guides"
                  className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  查看全部生活情境 →
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {relatedGuides.map((guide) => (
                  <Link
                    key={guide.slug}
                    href={`/guides/${guide.slug}`}
                    className="group flex flex-col justify-between rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-white hover:shadow-sm dark:border-indigo-900/50 dark:bg-indigo-950/20 dark:hover:border-indigo-700"
                  >
                    <div>
                      <span className="inline-block rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                        {guide.steps.length} 個步驟指南
                      </span>
                      <h3 className="mt-2.5 text-sm font-bold text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                        {guide.title}
                      </h3>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {guide.description}
                      </p>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      前往情境指南 →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
