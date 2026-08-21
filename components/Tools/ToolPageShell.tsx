import Link from "next/link";
import { buildToolPageJsonLd, getBaseUrl } from "@/lib/server/news/seo";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";

/**
 * Shared wrapper for every /tools/<slug> page.
 * Implements full-scale SEO, AEO, GEO, and E-E-A-T knowledge layout:
 * - Composite MedicalWebPage + WebApplication + FAQPage JSON-LD
 * - AEO Direct Answer Box (#aeo-direct-answer)
 * - Standard Semantic HTML Comparison/Reference Tables
 * - Calculation Formula & Evaluation Steps
 * - Scientific Basis & Official Citations
 * - Standard Medical Disclaimer
 * - Related Tools Cross-linking
 * - Structured FAQ Section
 */
export default function ToolPageShell({
  slug,
  title,
  children,
  maxWidthClassName = "max-w-3xl",
}: {
  slug: string;
  title: string;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  const baseUrl = getBaseUrl();
  const catalogEntry = TOOL_CATALOG.find((tool) => tool.slug === slug);
  const directAnswer = catalogEntry?.directAnswer ?? catalogEntry?.description ?? title;
  const faqs = catalogEntry?.faqs ?? [];
  const scientificBasis = catalogEntry?.scientificBasis ?? [];
  const referenceTable = catalogEntry?.referenceTable;
  const formula = catalogEntry?.formula;
  const relatedSlugs = catalogEntry?.relatedSlugs ?? [];

  const relatedTools = relatedSlugs
    .map((s) => TOOL_CATALOG.find((t) => t.slug === s))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const jsonLdSchemas = catalogEntry
    ? buildToolPageJsonLd(catalogEntry)
    : [];

  return (
    <>
      {jsonLdSchemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <StabloHeader />

        <main className={`mx-auto px-4 py-8 sm:px-6 lg:px-8 ${maxWidthClassName}`}>
          {/* Breadcrumb navigation */}
          <nav className="mb-6 text-xs font-medium text-slate-500 dark:text-slate-400" aria-label="breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  首頁
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li>
                <Link href="/tools" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                  健康工具與公衛資料庫
                </Link>
              </li>
              <li aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</li>
              <li aria-current="page" className="font-semibold text-slate-700 dark:text-slate-300">
                {title}
              </li>
            </ol>
          </nav>

          {/* Interactive Tool Widget (Children) */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            {children}
          </div>

          {/* 💡 AEO Direct Answer Box (Featured Snippet Optimization) */}
          {directAnswer ? (
            <section
              id="aeo-direct-answer"
              className="mt-8 rounded-2xl border border-indigo-200/80 bg-indigo-50/60 p-5 text-sm leading-relaxed text-slate-800 shadow-xs dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-slate-200"
              aria-labelledby="aeo-summary-heading"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 id="aeo-summary-heading" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  <span>💡</span>
                  <span>核心定義與重點快覽 (AEO Direct Answer)</span>
                </h2>
                <span className="font-mono text-[10px] text-slate-400">AI / Snippet Ready</span>
              </div>
              <p className="font-medium leading-relaxed">{directAnswer}</p>
            </section>
          ) : null}

          {/* 📐 Calculation Formula & Step-by-Step Breakdown (if applicable) */}
          {formula ? (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900" aria-labelledby="formula-heading">
              <h2 id="formula-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>📐</span>
                <span>計算公式與推算方法 (Formula & Calculation)</span>
              </h2>
              <div className="mt-3 rounded-xl bg-slate-100/80 p-3.5 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {formula}
              </div>
            </section>
          ) : null}

          {/* 📊 Structured HTML Reference Table (AEO Table Snippet) */}
          {referenceTable ? (
            <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900" aria-labelledby="reference-table-heading">
              <div className="border-b border-slate-100 bg-slate-50/75 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-850">
                <h2 id="reference-table-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>📊</span>
                  <span>{referenceTable.title || "標準對照與臨床指引表"}</span>
                </h2>
              </div>
              <div className="overflow-x-auto">
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
            </section>
          ) : null}

          {/* 🔬 Scientific Basis & Guidelines (E-E-A-T Citations) */}
          {scientificBasis.length > 0 ? (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900" aria-labelledby="scientific-basis-heading">
              <h2 id="scientific-basis-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>🔬</span>
                <span>科學依據與官方參考指引 (Authoritative Citations & Basis)</span>
              </h2>
              <ul className="mt-3 space-y-2 text-xs">
                {scientificBasis.map((ref, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
                    <span className="text-indigo-500 dark:text-indigo-400 mt-0.5">•</span>
                    <div>
                      {ref.url ? (
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-slate-800 hover:text-indigo-600 hover:underline dark:text-slate-200 dark:hover:text-indigo-400"
                        >
                          {ref.title}
                        </a>
                      ) : (
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{ref.title}</span>
                      )}
                      <span className="ml-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {ref.authority}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ⚕️ Standard Medical Disclaimer (E-E-A-T Trust) */}
          <section className="mt-8 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="flex items-start gap-2">
              <span className="text-base leading-none">⚕️</span>
              <span>
                <strong>醫療資訊免責聲明：</strong>
                本工具提供之計算數據、分級與生活建議僅供健康生活與自我評估參考，無法取代專業醫師之臨床診斷、治療計畫或處方諮詢。若有任何身體不適或疾病疑慮，請立即尋求合格醫療機構與專科醫師之專業協助。
              </span>
            </p>
          </section>

          {/* 🔗 Related Tools Recommendation Bar (Internal Linking Silo) */}
          {relatedTools.length > 0 ? (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900" aria-labelledby="related-tools-heading">
              <h2 id="related-tools-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>🔗</span>
                <span>相關健康評估工具推薦</span>
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
                    <span className="mt-1 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      {tool.description}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {/* ❓ Structured Frequently Asked Questions (FAQ Section) */}
          {faqs.length > 0 ? (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900" aria-labelledby="tool-faq-heading">
              <h2 id="tool-faq-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>❓</span>
                <span>常見問題解答 (FAQ)</span>
              </h2>
              <dl className="mt-4 space-y-4">
                {faqs.map((faq) => (
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
