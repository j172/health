import type { LlmsPageContent, LlmsPageSection } from "./llmsPage";

/**
 * Single source of truth for /accessibility's textual content — both
 * app/accessibility/page.tsx (the HTML page) and
 * buildAccessibilityLlmsPageContent (the llms.txt/markdown generator) render
 * from this same data instead of each keeping its own copy (issue #444
 * acceptance criterion 5).
 */
export const ACCESSIBILITY_LAST_UPDATED = "2026-09-26";

export const ACCESSIBILITY_SUMMARY =
  "本站依數位發展部《無障礙網頁開發規範 2.1》與 W3C WCAG 2.1 AA 級標準設計，提供 Skip Links、鍵盤快速鍵（AccessKey）、地圖等價清單模式與語音朗讀等無障礙功能。";

export const ACCESSIBILITY_COMMITMENT_PARAGRAPHS: string[] = [
  "j172tw Healthz（health.j172.tw，以下簡稱「本站」）堅信「數位人權、資訊平權」是公共服務之基石。為保障視覺障礙者、聽覺障礙者、肢體行動不便者及高齡長輩能無障礙獲取攸關民生之公衛醫療、防災安全、弱勢福利與生活圖資，本站各項網頁與功能模組均嚴格參照中華民國數位發展部《無障礙網頁開發規範 2.1》以及全球資訊網協會（W3C）Web Content Accessibility Guidelines (WCAG) 2.1 AA 級標準進行架構規劃與體驗優化。",
  "本站設有「快速跳過重覆區塊之錨點（Skip Links）」、「鍵盤定位點符號 :::」、「全域高對比焦點外框」、以及針對 Leaflet 地圖提供「等價結構化無障礙清單替代視圖」，確保即使不使用滑鼠或搭配螢幕報讀軟體（如 NVDA、JAWS、VoiceOver），亦能獲得 100% 完整之公衛與民生資訊。",
];

export interface AccessibilityShortcut {
  code: string;
  description: string;
  anchor: string;
}

export const ACCESSIBILITY_SHORTCUTS: AccessibilityShortcut[] = [
  { code: "Alt + C", description: "中間主要內容區：跳過上方導覽與輪播，直接聚焦至頁面核心文章、公衛工具或數據表格。", anchor: "#main-content" },
  { code: "Alt + U", description: "上方主要導覽區：瀏覽全站主選單，包含最新新聞、分類工具選單、語系與深色主題切換。", anchor: "#header-nav" },
  { code: "Alt + Z", description: "下方資訊與頁尾區：跳轉至頁尾全站分類連結、公民夥伴陣線、開放資料授權宣告與隱私政策。", anchor: "#footer-info" },
  { code: "Alt + S", description: "全域即時搜尋：開啟全站新聞與 90+ 種生活工具搜尋框（亦可直接按下 ⌘K 或 Ctrl+K）。", anchor: "#search-trigger" },
  { code: "Tab", description: "按序聚焦至下一個可互動元件；搭配 Shift + Tab 可反向返回前一個元件。", anchor: "循序導航" },
  { code: "Esc", description: "關閉搜尋彈窗、選單抽屜或沉浸閱讀視窗，並將焦點自動還原至原先觸發之按鈕。", anchor: "焦點還原" },
];

export interface AccessibilityHighlight {
  title: string;
  body: string;
}

export const ACCESSIBILITY_HIGHLIGHTS: AccessibilityHighlight[] = [
  {
    title: "🗺️ 互動地圖等價清單模式",
    body: "全站包含身障 ATM、母嬰親善室、AED 急救、避孕諮詢等 GIS 圖資頁面，均標配一鍵切換「📋 清單模式」，並提供跳過地圖錨點，免除鍵盤焦點受困於地圖 Canvas 的困擾。",
  },
  {
    title: "🎯 醒目高對比焦點提示",
    body: "全域配置無障礙專用 :focus-visible 樣式，鍵盤巡航時產生清晰的 2px 高飽和度輪廓線（Outline），滑鼠操作時則自動隱藏，兼顧視覺質感與合規可用性。",
  },
  {
    title: "📢 即時狀態語音廣播（ARIA Live）",
    body: '在縣市篩選、關鍵字檢索與資料即時載入時，透過 aria-live="polite" 播報「符合 X 筆據點」，讓視障者即時掌握動態資料變化。',
  },
  {
    title: "🔊 新聞沉浸閱讀與語音朗讀",
    body: "新聞專區內建語音朗讀（Web Speech API）與純文字沉浸模式，支援自訂字級放大、行距與米色護眼配色，貼心照顧弱視朋友與銀髮長輩。",
  },
];

export const ACCESSIBILITY_FEEDBACK_PARAGRAPH =
  "若您在瀏覽本站時遭遇任何無法使用、語音報讀不完整、對比度不足或鍵盤操作障礙，誠摯歡迎您與我們聯繫！本專案為開放原始碼公益專案，我們將於接獲反映後 3 至 5 個工作天內查驗並持續精進。";

export const ACCESSIBILITY_FEEDBACK_LINKS = [
  {
    label: "於 GitHub 開啟無障礙 Issue 通報",
    url: "https://github.com/j172/health/issues/new?title=%5BA11y%20Barrier%5D%20%E7%84%A1%E9%9A%9C%E7%A4%99%E5%95%8F%E9%A1%8C%E5%8F%8D%E6%98%A0&labels=accessibility",
  },
  {
    label: "寄送電子郵件至維護團隊 (contact@j172.tw)",
    url: "mailto:contact@j172.tw?subject=%5BAccessibility%20Feedback%5D%20j172tw%20Healthz%20%E7%84%A1%E9%9A%9C%E7%A4%99%E6%84%8F%E8%A6%8B%E5%8F%8D%E6%98%A0",
  },
];

/**
 * Builds the shared `LlmsPageContent` shape for `/accessibility`, from
 * exactly the same `ACCESSIBILITY_*` data `app/accessibility/page.tsx`
 * renders.
 */
export function buildAccessibilityLlmsPageContent(baseUrl: string): LlmsPageContent {
  const url = `${baseUrl}/accessibility`;

  const shortcutLines = ACCESSIBILITY_SHORTCUTS.map(
    (s) => `- \`${s.code}\`：${s.description}（${s.anchor}）`,
  );

  const highlightLines = ACCESSIBILITY_HIGHLIGHTS.map((h) => `- **${h.title}**：${h.body}`);

  const sections: LlmsPageSection[] = [
    { heading: "一、無障礙設計承諾與規範標準", paragraphs: ACCESSIBILITY_COMMITMENT_PARAGRAPHS },
    { heading: "二、鍵盤快速鍵（AccessKey）操作說明", paragraphs: shortcutLines },
    { heading: "三、本站無障礙技術實踐亮點", paragraphs: highlightLines },
    {
      heading: "四、無障礙障礙通報與意見回饋",
      paragraphs: [
        ACCESSIBILITY_FEEDBACK_PARAGRAPH,
        ...ACCESSIBILITY_FEEDBACK_LINKS.map((link) => `- [${link.label}](${link.url})`),
      ],
    },
  ];

  return {
    title: "網站無障礙設計宣告與快捷鍵指引",
    url,
    summary: ACCESSIBILITY_SUMMARY,
    sections,
    related: [
      { title: "隱私權政策", url: `${baseUrl}/privacy` },
      { title: "Hey AI 簡介頁", url: `${baseUrl}/llm-info` },
    ],
  };
}
