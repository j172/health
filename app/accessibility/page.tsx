import Link from "next/link";
import type { Metadata } from "next";
import { buildBreadcrumbJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import {
  ACCESSIBILITY_COMMITMENT_PARAGRAPHS,
  ACCESSIBILITY_FEEDBACK_LINKS,
  ACCESSIBILITY_FEEDBACK_PARAGRAPH,
  ACCESSIBILITY_HIGHLIGHTS,
  ACCESSIBILITY_LAST_UPDATED,
  ACCESSIBILITY_SHORTCUTS,
} from "@/lib/server/content/accessibilityContent";

export const revalidate = 86400;
export const runtime = "nodejs";

const LAST_UPDATED = ACCESSIBILITY_LAST_UPDATED;

export const metadata: Metadata = {
  title: "無障礙宣告與快捷鍵指引",
  description:
    "j172tw Healthz 台灣公衛健康地圖生活網無障礙宣告專頁。依據數位發展部《無障礙網頁開發規範 2.1》及 W3C WCAG 2.1 AA 級標準規劃，提供鍵盤快速鍵導引（AccessKey）、網站導覽與無障礙意見回饋窗口。",
  alternates: {
    canonical: `${getBaseUrl()}/accessibility`,
  },
  openGraph: {
    title: `無障礙宣告與快捷鍵指引 | ${SITE_NAME}`,
    description: "本站致力落實數位平權，遵循數位發展部無障礙 2.1 AA 級標準規範與快速鍵指引。",
    url: `${getBaseUrl()}/accessibility`,
    type: "website",
  },
};

export default function AccessibilityPage() {
  const baseUrl = getBaseUrl();
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "首頁", url: baseUrl },
    { name: "無障礙宣告", url: `${baseUrl}/accessibility` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      {/* Machine-readable sibling versions of this page (issue #444), built
       * from the exact same ACCESSIBILITY_* data rendered below via
       * lib/server/content/accessibilityContent.ts. */}
      <link rel="alternate" type="text/plain" title="無障礙宣告 - LLM Index (llms.txt)" href="/accessibility/llms.txt" />
      <link rel="alternate" type="text/markdown" title="無障礙宣告 - Clean Markdown" href="/accessibility/markdown" />
      <div className="min-h-screen bg-white text-neutral-800 dark:bg-slate-900 dark:text-slate-100">
        <StabloHeader />

        <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <nav
            className="mb-6 text-sm text-neutral-500 dark:text-slate-400"
            aria-label="breadcrumb"
          >
            <Link href="/" className="hover:text-neutral-900 dark:hover:text-slate-100">
              首頁
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <span aria-current="page" className="font-medium text-slate-800 dark:text-slate-200">
              無障礙宣告
            </span>
          </nav>

          <div className="space-y-10 text-sm leading-relaxed text-neutral-700 dark:text-slate-300">
            {/* Title Header */}
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300">
                  WCAG 2.1 AA 合規宣告
                </span>
                <span className="text-xs text-neutral-500 dark:text-slate-400">
                  更新日期：{LAST_UPDATED}
                </span>
              </div>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-slate-100 md:text-4xl">
                網站無障礙設計宣告與快捷鍵指引
              </h1>
            </div>

            {/* Section 1: 理念與法規承諾 */}
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-slate-100">
                一、無障礙設計承諾與規範標準
              </h2>
              {ACCESSIBILITY_COMMITMENT_PARAGRAPHS.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>

            {/* Section 2: 鍵盤快速鍵指南 */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-slate-100">
                二、鍵盤快速鍵（AccessKey）操作說明
              </h2>
              <p>
                本網站配置有便利之快捷鍵（AccessKey），讓使用者得以藉由鍵盤快速巡航跳轉至指定功能區塊。快速鍵之觸發方式依作業系統與瀏覽器環境有所不同：
              </p>
              <ul className="list-disc list-inside space-y-1 pl-2 text-xs sm:text-sm text-neutral-600 dark:text-slate-400">
                <li>
                  <strong className="text-neutral-800 dark:text-slate-200">Windows 系統：</strong>請使用 <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-800">Alt</kbd> + 快速鍵代碼（部分瀏覽器如 Firefox 可能需加按 <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-800">Shift</kbd>）。
                </li>
                <li>
                  <strong className="text-neutral-800 dark:text-slate-200">macOS 系統：</strong>請使用 <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-800">Control</kbd> + <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-800">Option</kbd> + 快速鍵代碼。
                </li>
              </ul>

              {/* Shortcuts Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs dark:border-slate-800">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">快速鍵代碼</th>
                      <th className="px-4 py-3 font-semibold">定位區塊與功能說明</th>
                      <th className="px-4 py-3 font-semibold">對應錨點</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900/40">
                    {ACCESSIBILITY_SHORTCUTS.map((shortcut) => (
                      <tr key={shortcut.code}>
                        <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {shortcut.code}
                        </td>
                        <td className="px-4 py-3">{shortcut.description}</td>
                        <td className="px-4 py-3 font-mono text-xs text-neutral-500">{shortcut.anchor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 3: 核心無障礙技術特點 */}
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-slate-100">
                三、本站無障礙技術實踐亮點
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {ACCESSIBILITY_HIGHLIGHTS.map((highlight) => (
                  <div
                    key={highlight.title}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50"
                  >
                    <h3 className="font-bold text-indigo-700 dark:text-indigo-400">{highlight.title}</h3>
                    <p className="mt-1.5 text-xs text-neutral-600 dark:text-slate-400">{highlight.body}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 4: 意見回饋與問題回報 */}
            <section className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-6 dark:border-indigo-900/40 dark:bg-indigo-950/20">
              <h2 className="text-xl font-bold text-indigo-950 dark:text-indigo-200">
                四、無障礙障礙通報與意見回饋
              </h2>
              <p className="text-neutral-700 dark:text-slate-300">{ACCESSIBILITY_FEEDBACK_PARAGRAPH}</p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href={
                    ACCESSIBILITY_FEEDBACK_LINKS[0].url.startsWith("https://")
                      ? appendOutboundUtm(ACCESSIBILITY_FEEDBACK_LINKS[0].url, {
                          medium: "accessibility_feedback",
                          campaign: "a11y_report",
                        })
                      : ACCESSIBILITY_FEEDBACK_LINKS[0].url
                  }
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <span>💬</span>
                  <span>{ACCESSIBILITY_FEEDBACK_LINKS[0].label}</span>
                </a>
                <a
                  href={ACCESSIBILITY_FEEDBACK_LINKS[1].url}
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-xs font-bold text-indigo-900 shadow-xs transition hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <span>✉️</span>
                  <span>{ACCESSIBILITY_FEEDBACK_LINKS[1].label}</span>
                </a>
              </div>
            </section>
          </div>
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
