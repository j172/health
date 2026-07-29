import Link from "next/link";
import { buildBreadcrumbJsonLd, getBaseUrl } from "@/lib/server/news/seo";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";

/** Shared wrapper for every /tools/<slug> page — breadcrumb + WebApplication + FAQPage schema, header/footer, and the breadcrumb nav row. Description/FAQ content comes from TOOL_CATALOG by slug, not props, so it stays in one place. */
export default function ToolPageShell({
  slug,
  title,
  children,
  maxWidthClassName = "max-w-2xl",
}: {
  slug: string;
  title: string;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}/tools/${slug}`;
  const catalogEntry = TOOL_CATALOG.find((tool) => tool.slug === slug);
  const description = catalogEntry?.description ?? title;
  const faqs = catalogEntry?.faqs ?? [];
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "首頁", url: baseUrl },
    { name: "健康工具", url: `${baseUrl}/tools` },
    { name: title, url: canonical },
  ]);

  // WebApplication tells an AI/search engine what this page *is* (a free
  // tool, not an article) — FAQPage gives it citable Q&A text, which is
  // exactly the shape GEO-oriented answer engines favor lifting verbatim.
  // Both must reflect content actually visible on the page (below), not
  // just live in the schema.
  const webApplication = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: title,
    url: canonical,
    description,
    inLanguage: "zh-TW",
    applicationCategory: "HealthApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "TWD" },
  };

  const faqJsonLd =
    faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
          })),
        }
      : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplication) }} />
      {faqJsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} /> : null}
      <div className="min-h-screen bg-white text-neutral-800">
        <StabloHeader />

        <main className={`mx-auto px-4 py-12 sm:px-6 lg:px-8 ${maxWidthClassName}`}>
          <nav className="mb-6 text-sm text-neutral-500" aria-label="breadcrumb">
            <Link href="/" className="hover:text-neutral-900">
              首頁
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <Link href="/tools" className="hover:text-neutral-900">
              健康工具
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <span aria-current="page">{title}</span>
          </nav>

          {children}

          {faqs.length > 0 ? (
            <section className="mt-12 border-t border-neutral-200 pt-8" aria-labelledby="tool-faq-heading">
              <h2 id="tool-faq-heading" className="text-lg font-semibold text-neutral-900">
                常見問題
              </h2>
              <dl className="mt-4 space-y-6">
                {faqs.map((faq) => (
                  <div key={faq.question}>
                    <dt className="font-medium text-neutral-800">{faq.question}</dt>
                    <dd className="mt-1.5 text-sm leading-6 text-neutral-600">{faq.answer}</dd>
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
