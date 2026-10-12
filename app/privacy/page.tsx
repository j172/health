import Link from "next/link";
import { buildBreadcrumbJsonLd, getBaseUrl } from "@/lib/server/news/seo";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { LAST_UPDATED, PRIVACY_CONTACT, PRIVACY_INTRO, PRIVACY_SECTIONS } from "@/lib/server/content/privacyContent";

export const revalidate = 86400;
export const runtime = "nodejs";

export default function PrivacyPage() {
  const baseUrl = getBaseUrl();
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "首頁", url: baseUrl },
    { name: "隱私權政策", url: `${baseUrl}/privacy` },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      {/* Machine-readable sibling versions of this page (issue #444), built
       * from the exact same PRIVACY_SECTIONS/PRIVACY_CONTACT data rendered
       * below via lib/server/content/privacyContent.ts. */}
      <link rel="alternate" type="text/plain" title="隱私權政策 - LLM Index (llms.txt)" href="/privacy/llms.txt" />
      <link rel="alternate" type="text/markdown" title="隱私權政策 - Clean Markdown" href="/privacy/markdown" />
      <div className="min-h-screen bg-white text-neutral-800 dark:bg-slate-900 dark:text-slate-100">
        <StabloHeader />

        <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <nav className="mb-6 text-sm text-neutral-500 dark:text-slate-400" aria-label="breadcrumb">
            <Link href="/" className="hover:text-neutral-900 dark:hover:text-slate-100">
              首頁
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <span aria-current="page">隱私權政策</span>
          </nav>

          <div className="space-y-8 text-sm leading-relaxed text-neutral-700 dark:text-slate-300">
            <div>
              <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">隱私權政策與同意聲明</h1>
              <p className="text-neutral-500 dark:text-slate-400">最後更新日期：{LAST_UPDATED}</p>
            </div>

            <p>{PRIVACY_INTRO}</p>

            {PRIVACY_SECTIONS.map((section) => (
              <section key={section.heading} className="space-y-2">
                <h2 className="text-xl font-semibold text-neutral-800 dark:text-slate-100">{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.items ? (
                  <ul className="list-inside list-disc space-y-2">
                    {section.items.map((item) => (
                      <li key={item.label ?? item.body}>
                        {item.label ? (
                          <span className="font-medium text-neutral-800 dark:text-slate-100">{item.label}：</span>
                        ) : null}
                        {item.body}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-neutral-800 dark:text-slate-100">{PRIVACY_CONTACT.heading}</h2>
              <p>
                {PRIVACY_CONTACT.leadIn}{" "}
                <a
                  href={appendOutboundUtm(PRIVACY_CONTACT.linkUrl, {
                    medium: "cross_promo",
                    campaign: "main_site",
                    content: "privacy",
                  })}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline hover:no-underline"
                >
                  {PRIVACY_CONTACT.linkLabel}
                </a>{" "}
                {PRIVACY_CONTACT.trailing}
              </p>
            </section>
          </div>
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
