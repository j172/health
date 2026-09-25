import Link from "next/link";
import type { Metadata } from "next";
import { buildBreadcrumbJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";

export const revalidate = 86400;
export const runtime = "nodejs";

const LAST_UPDATED = "2026-09-26";

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
              <p>
                j172tw Healthz（health.j172.tw，以下簡稱「本站」）堅信<strong>「數位人權、資訊平權」</strong>是公共服務之基石。為保障視覺障礙者、聽覺障礙者、肢體行動不便者及高齡長輩能無障礙獲取攸關民生之公衛醫療、防災安全、弱勢福利與生活圖資，本站各項網頁與功能模組均嚴格參照<strong>中華民國數位發展部《無障礙網頁開發規範 2.1》</strong>以及<strong>全球資訊網協會（W3C）Web Content Accessibility Guidelines (WCAG) 2.1 AA 級標準</strong>進行架構規劃與體驗優化。
              </p>
              <p>
                本站設有「快速跳過重覆區塊之錨點（Skip Links）」、「鍵盤定位點符號 :::」、「全域高對比焦點外框」、以及針對 Leaflet 地圖提供「等價結構化無障礙清單替代視圖」，確保即使不使用滑鼠或搭配螢幕報讀軟體（如 NVDA、JAWS、VoiceOver），亦能獲得 100% 完整之公衛與民生資訊。
              </p>
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
                    <tr>
                      <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        Alt + C
                      </td>
                      <td className="px-4 py-3">
                        <strong className="text-neutral-900 dark:text-slate-100">中間主要內容區</strong>：跳過上方導覽與輪播，直接聚焦至頁面核心文章、公衛工具或數據表格。
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-500">#main-content</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        Alt + U
                      </td>
                      <td className="px-4 py-3">
                        <strong className="text-neutral-900 dark:text-slate-100">上方主要導覽區</strong>：瀏覽全站主選單，包含最新新聞、分類工具選單、語系與深色主題切換。
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-500">#header-nav</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        Alt + Z
                      </td>
                      <td className="px-4 py-3">
                        <strong className="text-neutral-900 dark:text-slate-100">下方資訊與頁尾區</strong>：跳轉至頁尾全站分類連結、公民夥伴陣線、開放資料授權宣告與隱私政策。
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-500">#footer-info</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        Alt + S
                      </td>
                      <td className="px-4 py-3">
                        <strong className="text-neutral-900 dark:text-slate-100">全域即時搜尋</strong>：開啟全站新聞與 90+ 種生活工具搜尋框（亦可直接按下 <kbd className="rounded border border-slate-300 bg-slate-100 px-1 text-xs font-mono dark:border-slate-700 dark:bg-slate-800">⌘K</kbd> 或 <kbd className="rounded border border-slate-300 bg-slate-100 px-1 text-xs font-mono dark:border-slate-700 dark:bg-slate-800">Ctrl+K</kbd>）。
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-500">#search-trigger</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-mono font-bold text-slate-600 dark:text-slate-400">
                        Tab
                      </td>
                      <td className="px-4 py-3">
                        按序聚焦至下一個可互動元件；搭配 <kbd className="rounded border border-slate-300 bg-slate-100 px-1 text-xs font-mono dark:border-slate-700 dark:bg-slate-800">Shift</kbd> + <kbd className="rounded border border-slate-300 bg-slate-100 px-1 text-xs font-mono dark:border-slate-700 dark:bg-slate-800">Tab</kbd> 可反向返回前一個元件。
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-500">循序導航</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-mono font-bold text-slate-600 dark:text-slate-400">
                        Esc
                      </td>
                      <td className="px-4 py-3">
                        關閉搜尋彈窗、選單抽屜或沉浸閱讀視窗，並將焦點自動還原至原先觸發之按鈕。
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-500">焦點還原</td>
                    </tr>
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
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <h3 className="font-bold text-indigo-700 dark:text-indigo-400">
                    🗺️ 互動地圖等價清單模式
                  </h3>
                  <p className="mt-1.5 text-xs text-neutral-600 dark:text-slate-400">
                    全站包含身障 ATM、母嬰親善室、AED 急救、避孕諮詢等 GIS 圖資頁面，均標配一鍵切換「📋 清單模式」，並提供跳過地圖錨點，免除鍵盤焦點受困於地圖 Canvas 的困擾。
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <h3 className="font-bold text-indigo-700 dark:text-indigo-400">
                    🎯 醒目高對比焦點提示
                  </h3>
                  <p className="mt-1.5 text-xs text-neutral-600 dark:text-slate-400">
                    全域配置無障礙專用 <code>:focus-visible</code> 樣式，鍵盤巡航時產生清晰的 2px 高飽和度輪廓線（Outline），滑鼠操作時則自動隱藏，兼顧視覺質感與合規可用性。
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <h3 className="font-bold text-indigo-700 dark:text-indigo-400">
                    📢 即時狀態語音廣播（ARIA Live）
                  </h3>
                  <p className="mt-1.5 text-xs text-neutral-600 dark:text-slate-400">
                    在縣市篩選、關鍵字檢索與資料即時載入時，透過 <code>aria-live=&quot;polite&quot;</code> 播報「符合 X 筆據點」，讓視障者即時掌握動態資料變化。
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <h3 className="font-bold text-indigo-700 dark:text-indigo-400">
                    🔊 新聞沉浸閱讀與語音朗讀
                  </h3>
                  <p className="mt-1.5 text-xs text-neutral-600 dark:text-slate-400">
                    新聞專區內建語音朗讀（Web Speech API）與純文字沉浸模式，支援自訂字級放大、行距與米色護眼配色，貼心照顧弱視朋友與銀髮長輩。
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4: 意見回饋與問題回報 */}
            <section className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-6 dark:border-indigo-900/40 dark:bg-indigo-950/20">
              <h2 className="text-xl font-bold text-indigo-950 dark:text-indigo-200">
                四、無障礙障礙通報與意見回饋
              </h2>
              <p className="text-neutral-700 dark:text-slate-300">
                若您在瀏覽本站時遭遇任何無法使用、語音報讀不完整、對比度不足或鍵盤操作障礙，誠摯歡迎您與我們聯繫！本專案為開放原始碼公益專案，我們將於接獲反映後 3 至 5 個工作天內查驗並持續精進。
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href="https://github.com/j172/health/issues/new?title=%5BA11y%20Barrier%5D%20%E7%84%A1%E9%9A%9C%E7%A4%99%E5%95%8F%E9%A1%8C%E5%8F%8D%E6%98%A0&labels=accessibility"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <span>💬</span>
                  <span>於 GitHub 開啟無障礙 Issue 通報</span>
                </a>
                <a
                  href="mailto:contact@j172.tw?subject=%5BAccessibility%20Feedback%5D%20j172tw%20Healthz%20%E7%84%A1%E9%9A%9C%E7%A4%99%E6%84%8F%E8%A6%8B%E5%8F%8D%E6%98%A0"
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-xs font-bold text-indigo-900 shadow-xs transition hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <span>✉️</span>
                  <span>寄送電子郵件至維護團隊 (contact@j172.tw)</span>
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
