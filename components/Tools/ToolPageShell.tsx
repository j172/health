import { Suspense } from "react";
import Link from "next/link";
import { buildToolGraphJsonLd, getBaseUrl } from "@/lib/server/news/seo";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { getGuidesForTool, getRelatedTools, getToolCategoryLink } from "@/lib/server/tools/navModel";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { TOOL_MEDICAL_DISCLAIMER } from "@/lib/server/content/toolLlmsPage";
import { findRelatedNewsForTool } from "@/lib/server/content/relatedNewsForTool";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import { displayDate, toTaipei } from "@/lib/format/news";
import RecentToolRecorder from "@/components/Tools/RecentToolRecorder";
import { getDictionary, type Locale } from "@/lib/i18n/dictionary";
import { buildLocalizedPath, isTranslatedToolSlug } from "@/lib/i18n/translatedPages";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import OtherLanguagesBanner from "@/components/Tools/OtherLanguagesBanner";

/**
 * Shared wrapper for every /tools/<slug> page.
 * Implements full-scale SEO, AEO, GEO, and E-E-A-T knowledge layout:
 * - Composite MedicalWebPage/WebPage + WebApplication + FAQPage JSON-LD
 *   (the page type is MedicalWebPage by default, or WebPage for tools whose
 *   catalog entry opts out via `schemaType` — see ToolCatalogEntry, issue #136)
 * - Related Tools Cross-linking ("下一步")
 * - Related News Cross-linking
 * - Life-situation Guide Cross-linking
 * - Last-updated timestamp (#tool-last-updated, issue #457)
 * - AEO Direct Answer Box (#aeo-direct-answer)
 * - Calculation Formula & Evaluation Steps (collapsible)
 * - Standard Semantic HTML Comparison/Reference Tables (collapsible)
 * - Scientific Basis & Official Citations (collapsible)
 * - Structured FAQ Section (collapsible)
 * - Standard Medical Disclaimer (last)
 *
 * Section order (issue #471, reordered from the original tool-body →
 * formulas/tables/basis/FAQ → related-tools layout): tool body first (so a
 * mobile user sees the tool itself without scrolling past a wall of text),
 * then "下一步" related tools, related news, the life-situation guide(s)
 * this tool belongs to (via `getGuidesForTool`, issue #465's first UI
 * consumer), then the AEO direct-answer box, then the four long-form
 * reference sections — now native <details>/<summary> elements, collapsed
 * by default but still fully present in the raw HTML (so the JSON-LD
 * FAQPage/citations graph built below from the same catalog data is
 * unaffected by the collapsed UI state) — and finally the medical
 * disclaimer, always last.
 */
export default async function ToolPageShell({
  slug,
  title,
  children,
  maxWidthClassName = "max-w-3xl",
  locale = "zh-TW",
}: {
  slug: string;
  title: string;
  children: React.ReactNode;
  maxWidthClassName?: string;
  /** issue #485: the 3 pilot /en//ja//ko/ pages pass their route locale so
   * this shared shell — used by every /tools/<slug> page, translated or
   * not — renders its own chrome and the catalog-derived directAnswer/FAQ
   * in that language. Defaults to "zh-TW", so every one of the ~78 other
   * (not yet translated) tool pages behaves byte-for-byte as before. */
  locale?: Locale;
}) {
  const baseUrl = getBaseUrl();
  const { t } = getDictionary(locale);
  const catalogEntry = TOOL_CATALOG.find((tool) => tool.slug === slug);
  const isTranslatedTool = isTranslatedToolSlug(slug);
  // Only a translated tool's own catalog fields get swapped for the locale
  // version — an untranslated tool stays Chinese regardless of `locale`
  // (shouldn't happen in practice since app/[locale]/tools/<slug>/page.tsx
  // only exists for translated slugs, but this keeps the fallback honest).
  const localizedMeta =
    isTranslatedTool && locale !== "zh-TW" ? getLocalizedToolMeta(slug, locale) : null;
  const directAnswer = localizedMeta?.directAnswer ?? catalogEntry?.directAnswer ?? catalogEntry?.description ?? title;
  const faqs = localizedMeta?.faqs ?? catalogEntry?.faqs ?? [];
  const scientificBasis = catalogEntry?.scientificBasis ?? [];
  const referenceTable = catalogEntry?.referenceTable;
  const formula = catalogEntry?.formula;
  // Related-tools auto-fill (issue #464): the manually curated
  // `relatedSlugs` display first, in order; when that resolves to fewer
  // than 4 tools, getRelatedTools appends same-`group` tools until there are
  // 4 (or the category itself runs out of other members) — see
  // lib/server/tools/navModel.ts's getRelatedTools for the full rule.
  const relatedTools = getRelatedTools(slug);
  // Tools → News cross-linking (issue #462): up to 3 recent news articles
  // whose title matches this tool's `keywords`, via the DB-backed half of
  // lib/server/content/crossLinks.ts (its candidate pool is read through
  // the already-`memoizeQuery`-cached listLatestNews, so this doesn't issue
  // a fresh query on every single tool-page request — see that module's
  // doc comment). Only computed when a catalog entry exists; an unknown
  // slug has no keywords to match against.
  const relatedNews = catalogEntry ? await findRelatedNewsForTool(catalogEntry) : [];
  // Life-situation guides this tool belongs to (issue #465's getGuidesForTool,
  // first consumed here per issue #471 — a pure reverse lookup over GUIDES,
  // no DB involved, so it's safe to call unconditionally).
  const guides = getGuidesForTool(slug);

  // issue #485: when a locale override exists, the JSON-LD graph is built
  // from the SAME merged (title/description/directAnswer/faqs-overridden)
  // entry the visible page renders, so a crawler never sees English visible
  // text paired with Chinese structured data (or vice versa).
  const localizedCatalogEntry =
    catalogEntry && localizedMeta ? { ...catalogEntry, ...localizedMeta } : catalogEntry;
  const toolGraph = localizedCatalogEntry ? buildToolGraphJsonLd(localizedCatalogEntry) : null;
  // Category breadcrumb level (issue #459): resolved from the catalog
  // entry's `group` via the shared getToolCategoryLink helper, kept in sync
  // with the JSON-LD BreadcrumbList buildToolGraphJsonLd builds for the same
  // tool. `catalogEntry` is only absent for a slug with no TOOL_CATALOG
  // entry, in which case there's no group to resolve and the breadcrumb
  // falls back to its previous 3-level shape.
  const categoryLink = catalogEntry ? getToolCategoryLink(catalogEntry.group) : null;

  return (
    <>
      {toolGraph && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(toolGraph) }}
        />
      )}
      {/* Machine-readable sibling versions of this specific tool page (issue
       * #444) — a per-page llms.txt (https://llmstxt.org/) and a clean
       * full-page Markdown rendering, both built from this same
       * TOOL_CATALOG entry via lib/server/content/toolLlmsPage.ts. Rendered
       * here (rather than via the page-level Metadata API) because every
       * /tools/<slug> page shares this one component, so this single pair
       * of tags covers all of them; React hoists <link> elements to <head>
       * no matter where in the tree they render.
       *
       * Issue #488: on a /{locale}/tools/<slug> page (locale !== "zh-TW",
       * which only ever happens for a translated slug — see this
       * component's own `locale` prop doc comment), these must point at
       * that locale's own llms.txt/markdown sibling
       * (app/[locale]/tools/[slug]/llms.txt|markdown/route.ts), never at
       * the zh ones, or a crawler reading this tag off the English page
       * would be handed Chinese content instead. */}
      <link
        rel="alternate"
        type="text/plain"
        title={`${title} - LLM Index (llms.txt)`}
        href={`${buildLocalizedPath(`/tools/${slug}`, locale)}/llms.txt`}
      />
      <link
        rel="alternate"
        type="text/markdown"
        title={`${title} - Clean Markdown`}
        href={`${buildLocalizedPath(`/tools/${slug}`, locale)}/markdown`}
      />

      {/* 最近使用的工具 (issue #472): records this slug into the device-only
       * localStorage list the homepage reads back — see
       * components/Home/RecentToolsSection.tsx. */}
      <RecentToolRecorder slug={slug} />

      <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <StabloHeader />

        <main className={`mx-auto px-4 py-8 sm:px-6 lg:px-8 ${maxWidthClassName}`}>
          {/* issue #485 acceptance criterion 5: on the zh page of a
              translated tool, a dismissible banner advertises the other
              language versions exist — never an auto-redirect. */}
          {isTranslatedTool && locale === "zh-TW" ? (
            <OtherLanguagesBanner canonicalPath={`/tools/${slug}`} />
          ) : null}

          {/* Breadcrumb navigation */}
          <nav className="mb-6 text-xs font-medium text-slate-600 dark:text-slate-400" aria-label="breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                {/* issue #485: the home page and /tools index aren't
                    themselves translated by this ticket (#486/#487/#488
                    will grow TRANSLATED_PAGES to cover them) — these two
                    breadcrumb links always point at the real, existing zh
                    pages rather than a /{locale}/ URL that would 404. */}
                <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  {t("toolShell.home", "首頁")}
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li>
                <Link href="/tools" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  {t("toolShell.toolsIndex", "工具")}
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              {categoryLink ? (
                <>
                  <li>
                    <Link href={categoryLink.href} className="hover:text-indigo-600 dark:hover:text-indigo-400">
                      {categoryLink.label}
                    </Link>
                  </li>
                  <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
                </>
              ) : null}
              <li aria-current="page" className="font-semibold text-slate-700 dark:text-slate-300">
                {title}
              </li>
            </ol>
          </nav>

          {/* 🕒 Last-updated timestamp (issue #457) — sourced from the
              catalog entry's `lastUpdated`, which also feeds `dateModified`
              on the JSON-LD page node built by buildToolGraphJsonLd, so the
              visible date and the structured-data date can't drift apart. */}
          {catalogEntry?.lastUpdated ? (
            <p
              id="tool-last-updated"
              className="mb-4 text-right text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              {t("toolShell.lastUpdatedLabel", "最後更新：")}
              <time dateTime={catalogEntry.lastUpdated}>{toTaipei(catalogEntry.lastUpdated, "medium")}</time>
            </p>
          ) : null}

          {/* Interactive Tool Widget (Children) */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <Suspense fallback={<div className="min-h-[220px] animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/40" />}>
              {children}
            </Suspense>
          </div>

          {/* 🔗 "下一步" Related Tools Recommendation Bar (Internal Linking
              Silo) — issue #471: moved to immediately follow the tool body
              itself, instead of sitting below the formulas/FAQ wall of text,
              so a user who just finished using the tool sees where to go
              next before anything else. */}
          {relatedTools.length > 0 ? (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900" aria-labelledby="related-tools-heading">
              <h2 id="related-tools-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>🔗</span>
                <span>{t("toolShell.relatedToolsHeading", "下一步：相關健康評估工具推薦")}</span>
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {relatedTools.map((tool) => (
                  <Link
                    key={tool.slug}
                    href={`/tools/${tool.slug}`}
                    className="group flex flex-col rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 transition-all hover:border-indigo-200 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-850 dark:hover:border-indigo-900/50 dark:hover:bg-indigo-950/30"
                  >
                    <span className="font-semibold text-xs text-slate-800 group-hover:text-indigo-600 dark:text-slate-200 dark:group-hover:text-indigo-400">
                      {tool.title}
                    </span>
                    <span className="mt-1 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                      {tool.description}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {/* 📰 Related News Recommendation Bar (issue #462: Tools → News
              cross-linking). No empty section when nothing matches. Issue
              #471 moved this up to sit right after "下一步", ahead of the
              now-collapsed formulas/reference-table/scientific-basis/FAQ
              block. */}
          {relatedNews.length > 0 ? (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900" aria-labelledby="related-news-heading">
              <h2 id="related-news-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>📰</span>
                <span>{t("toolShell.relatedNewsHeading", "相關新聞報導")}</span>
              </h2>
              <ul className="mt-3 space-y-3">
                {relatedNews.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/news/${item.id}`}
                      className="group flex flex-col gap-0.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 transition-all hover:border-indigo-200 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-850 dark:hover:border-indigo-900/50 dark:hover:bg-indigo-950/30"
                    >
                      <span className="line-clamp-2 text-xs font-semibold text-slate-800 group-hover:text-indigo-600 dark:text-slate-200 dark:group-hover:text-indigo-400">
                        {item.title}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {item.feed_name} · {toTaipei(displayDate(item), "short")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* 🧭 Life-situation Guide(s) this tool belongs to (issue #465's
              getGuidesForTool, first consumed here per issue #471). Renders
              nothing when the tool isn't part of any of the 5 GUIDES. */}
          {guides.length > 0 ? (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900" aria-labelledby="related-guides-heading">
              <h2 id="related-guides-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>🧭</span>
                <span>{t("toolShell.relatedGuidesHeading", "所屬生活情境指南")}</span>
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {guides.map((guide) => (
                  <Link
                    key={guide.slug}
                    href={guide.href}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/60 px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-300 dark:hover:border-indigo-900/50 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
                  >
                    {guide.title}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {/* 💡 AEO Direct Answer Box (Featured Snippet Optimization) — kept
              visible by default (not collapsed): it's a single short
              paragraph, not the "wall of text" the mobile-first acceptance
              criterion is about, and its #aeo-direct-answer id is referenced
              by buildToolGraphJsonLd's `speakable.cssSelector`. */}
          {directAnswer ? (
            <section
              id="aeo-direct-answer"
              className="mt-8 rounded-2xl border border-indigo-200/80 bg-indigo-50/60 p-5 text-sm leading-relaxed text-slate-800 shadow-xs dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-slate-200"
              aria-labelledby="aeo-summary-heading"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 id="aeo-summary-heading" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  <span>💡</span>
                  <span>{t("toolShell.aeoHeading", "核心定義與重點快覽 (AEO Direct Answer)")}</span>
                </h2>
                <span className="font-mono text-[10px] text-slate-600">{t("toolShell.aeoBadge", "AI / Snippet Ready")}</span>
              </div>
              <p className="font-medium leading-relaxed">{directAnswer}</p>
            </section>
          ) : null}

          {/* 📐 Calculation Formula & Step-by-Step Breakdown (if applicable).
              Issue #471: now a native <details>/<summary> element, collapsed
              by default. The content stays in the page's raw HTML either
              way — <details> only toggles visibility via the `open`
              attribute/CSS, it never unmounts its children — so this has no
              effect on the separate JSON-LD <script> tag above, which is
              built straight from the catalog entry regardless of UI state. */}
          {formula ? (
            <details className="group mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 [&::-webkit-details-marker]:hidden">
                <h2 id="formula-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>📐</span>
                  <span>{t("toolShell.formulaHeading", "計算公式與推算方法 (Formula & Calculation)")}</span>
                </h2>
                <span aria-hidden="true" className="shrink-0 text-slate-400 transition-transform group-open:rotate-90 dark:text-slate-500">▸</span>
              </summary>
              <div className="border-t border-slate-100 px-5 pb-5 pt-4 dark:border-slate-800">
                <div className="rounded-xl bg-slate-100/80 p-3.5 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  {formula}
                </div>
              </div>
            </details>
          ) : null}

          {/* 📊 Structured HTML Reference Table (AEO Table Snippet). Issue
              #471: collapsed by default via <details>/<summary>. */}
          {referenceTable ? (
            <details className="group mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 [&::-webkit-details-marker]:hidden">
                <h2 id="reference-table-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>📊</span>
                  <span>{referenceTable.title || t("toolShell.referenceTableDefaultTitle", "標準對照與臨床指引表")}</span>
                </h2>
                <span aria-hidden="true" className="shrink-0 text-slate-400 transition-transform group-open:rotate-90 dark:text-slate-500">▸</span>
              </summary>
              <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-100/60 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      {referenceTable.headers.map((header, idx) => (
                        <th key={idx} scope="col" className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {referenceTable.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-4 py-3 font-medium">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}

          {/* 🔬 Scientific Basis & Guidelines (E-E-A-T Citations). Issue
              #471: collapsed by default via <details>/<summary>. */}
          {scientificBasis.length > 0 ? (
            <details className="group mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 [&::-webkit-details-marker]:hidden">
                <h2 id="scientific-basis-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>🔬</span>
                  <span>{t("toolShell.scientificBasisHeading", "科學依據與官方參考指引 (Authoritative Citations & Basis)")}</span>
                </h2>
                <span aria-hidden="true" className="shrink-0 text-slate-400 transition-transform group-open:rotate-90 dark:text-slate-500">▸</span>
              </summary>
              <div className="border-t border-slate-100 px-5 pb-5 pt-4 dark:border-slate-800">
                <ul className="space-y-2 text-xs">
                  {scientificBasis.map((ref, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
                      <span className="text-indigo-500 dark:text-indigo-400 mt-0.5">•</span>
                      <div>
                        {ref.url ? (
                          <a
                            href={appendOutboundUtm(ref.url, {
                              medium: "scientific_basis",
                              campaign: "tool_citations",
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-slate-800 hover:text-indigo-600 hover:underline dark:text-slate-200 dark:hover:text-indigo-400"
                          >
                            {ref.title}
                          </a>
                        ) : (
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{ref.title}</span>
                        )}
                        <span className="ml-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {ref.authority}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}

          {/* ❓ Structured Frequently Asked Questions (FAQ Section). Issue
              #471: collapsed by default via <details>/<summary>. The FAQPage
              JSON-LD graph entry (built earlier in this component from the
              same `faqs` array, independent of this markup) still reports
              every question/answer in full regardless of this element's
              open/closed state. */}
          {faqs.length > 0 ? (
            <details className="group mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-6 [&::-webkit-details-marker]:hidden">
                <h2 id="tool-faq-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>❓</span>
                  <span>{t("toolShell.faqHeading", "常見問題解答 (FAQ)")}</span>
                </h2>
                <span aria-hidden="true" className="shrink-0 text-slate-400 transition-transform group-open:rotate-90 dark:text-slate-500">▸</span>
              </summary>
              <div className="border-t border-slate-100 px-6 pb-6 pt-4 dark:border-slate-800">
                <dl className="space-y-4">
                  {faqs.map((faq) => (
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
              </div>
            </details>
          ) : null}

          {/* ⚕️ Standard Medical Disclaimer (E-E-A-T Trust) — issue #471:
              moved to be the very last section on the page. */}
          <section className="mt-8 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="flex items-start gap-2">
              <span className="text-base leading-none">⚕️</span>
              <span>
                <strong>{t("toolShell.disclaimerLabel", "醫療資訊免責聲明：")}</strong>
                {t("toolShell.disclaimerText", TOOL_MEDICAL_DISCLAIMER)}
              </span>
            </p>
          </section>
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
