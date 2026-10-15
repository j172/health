import { compareByStrokeOrder } from "./strokeOrder";
import type { Topic } from "@/lib/server/news/classifyTopics";

export interface ToolFaq {
  question: string;
  answer: string;
}

export interface ScientificReference {
  title: string;
  authority: string;
  url?: string;
}

export interface ReferenceTable {
  title?: string;
  headers: string[];
  rows: string[][];
}

export type ToolGroup =
  | "health-assessment"
  | "medical-care"
  | "elder-care-welfare"
  | "family"
  | "disaster-alerts"
  | "environment-food"
  | "life-culture";

export interface ToolGroupMeta {
  group: ToolGroup;
  /** i18n dictionary key (locales/{zh-TW,en}.json → nav.*) for this category's label. */
  labelKey: string;
  /** Traditional Chinese default, used when a translation is missing and as
   * the source string for `compareByStrokeOrder`'s category ordering. */
  labelDefault: string;
}

/**
 * Single source of truth for the 7 Nav-dropdown / Footer-column / /tools
 * category buckets (issue #442 reclassification, down from the previous 9 —
 * see issue #438 §A) — SiteNav.tsx and SiteFooter.tsx both derive their
 * category list from this array instead of each hand-rolling their own, so
 * the two can't drift out of sync.
 */
export const TOOL_GROUP_META: ToolGroupMeta[] = [
  { group: "health-assessment", labelKey: "nav.healthAssessment", labelDefault: "健康自我評估" },
  { group: "medical-care", labelKey: "nav.medicalCare", labelDefault: "就醫與用藥" },
  { group: "elder-care-welfare", labelKey: "nav.elderCareWelfare", labelDefault: "長照與社會福利" },
  { group: "family", labelKey: "nav.family", labelDefault: "婦幼與家庭" },
  { group: "disaster-alerts", labelKey: "nav.disasterAlerts", labelDefault: "防災與示警" },
  { group: "environment-food", labelKey: "nav.environmentFood", labelDefault: "環境與食品安全" },
  { group: "life-culture", labelKey: "nav.lifeCulture", labelDefault: "交通、生活與文化" },
];

export interface ToolCatalogEntry {
  slug: string;
  title: string;
  /**
   * Optional short label for the Nav dropdowns and Footer columns, when the
   * SEO `title` (kept verbatim in every page's `<title>`/meta/JSON-LD) is too
   * long or verbose for a nav list — e.g. a colon-subtitle title like
   * "文化資產地圖：古蹟／歷史建築／考古遺址查詢" navigates better as just
   * "文化資產地圖". Falls back to `title` when omitted; most entries don't
   * need it. Never affects the tool page's own metadata.
   */
  navLabel?: string;
  description: string;
  /**
   * Common nicknames, synonyms, and news-headline terms for this tool that
   * don't otherwise appear in `title`/`description`/`directAnswer` — e.g. AED's
   * keywords include "心臟電擊", BMI's include "肥胖". `searchTools` matches
   * against these alongside the other text fields (issue #441). This is the
   * shared foundation for the future Ctrl+K search-across-tools, the news↔tool
   * cross-linking, and each page's `llms.txt` keywords — every entry must set
   * at least one.
   */
  keywords: string[];
  /** Direct-answer concise definition for AEO / Featured Snippets / AI Overviews (40-80 chars) */
  directAnswer: string;
  /** Official scientific guidelines, government bodies, or published research backing this tool */
  scientificBasis: ScientificReference[];
  /** Mathematical formula or calculation steps where applicable */
  formula?: string;
  /** Structured HTML semantic table for featured snippet ranking and comparison */
  referenceTable?: ReferenceTable;
  /** Related tool slugs for internal linking and topic clusters */
  relatedSlugs: string[];
  faqs: ToolFaq[];
  /** Drives the nav dropdowns, the footer columns and the /tools index sections
   * from one place (issue #442 reclassification, down from 9 to 7 groups):
   * "health-assessment" → 健康自我評估; "medical-care" → 就醫與用藥;
   * "elder-care-welfare" → 長照與社會福利; "family" → 婦幼與家庭;
   * "disaster-alerts" → 防災與示警; "environment-food" → 環境與食品安全;
   * "life-culture" → 交通、生活與文化. */
  group: ToolGroup;
  /**
   * ISO 8601 date (`YYYY-MM-DD`) this entry's content was last substantively
   * edited — surfaced on every `/tools/<slug>` page (issue #457) both as a
   * visible "最後更新" timestamp in `ToolPageShell.tsx` and as `dateModified`
   * on the page's JSON-LD node in `buildToolGraphJsonLd`.
   *
   * Every one of the ~81 entries below was backfilled from real git history
   * (`git blame` on this file, ignoring pure reclassification/reordering
   * fields like `slug`/`group`/`relatedSlugs`/`schemaType` and blank lines,
   * so a bulk relabel commit doesn't fake every tool into "updated today") —
   * none of these values are guessed. Going forward, whoever edits an
   * entry's substantive content (title/description/directAnswer/
   * scientificBasis/formula/referenceTable/faqs/keywords) should bump this
   * by hand to that day's date as part of the same change.
   */
  lastUpdated: string;
  /**
   * schema.org type for the page-level JSON-LD built by `buildToolPageJsonLd`
   * (lib/server/news/seo.ts). Defaults to "MedicalWebPage" when omitted — right
   * for the health calculators and medical/care-facility directories that make
   * up most of the catalog. Set to "WebPage" for tools that surface a
   * regulatory, business, or administrative open dataset with no clinical or
   * personal-health-guidance content (e.g. an NPO tax registry, a kindergarten
   * directory, an earthquake feed) — `MedicalWebPage`'s `medicalAudience`
   * property doesn't apply to those and using it anyway is a schema.org type
   * misuse (issue #136).
   */
  schemaType?: "MedicalWebPage" | "WebPage";
  /**
   * Declares this tool as belonging to one of lib/server/news/classifyTopics.ts's
   * news topics (issue #565) — when set, the tool page's "相關新聞" section
   * (lib/server/content/relatedNewsForTool.ts) fetches the latest N articles
   * carrying this topic directly, instead of keyword-ranking a candidate
   * pool of the 150 most recent articles site-wide. That pool-based ranking
   * stays the default for every tool that omits this field; it only changes
   * behavior for tools that opt in. `mental-health` → "anti-drug",
   * `smoking-cessation` → "tobacco" are the first two (#562's plan); #564's
   * anti-fraud tool (not yet merged as of this writing) sets its own
   * "anti-fraud" value independently.
   */
  newsTopic?: Topic;
}

// Single source of truth for "what tools does this site have" — used by
// llms.txt (app/llms.txt/route.ts), sitemap.ts, and ToolPageShell (which
// derives each page's WebApplication/MedicalWebPage/FAQPage structured data
// automatically by slug), so all stay in sync without duplicating text.
export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    slug: "uv",
    group: "disaster-alerts",
    lastUpdated: "2026-10-12",

    title: "全臺即時紫外線指數 (UV)",
    keywords: ["紫外線", "曝曬", "防曬", "UV指數"],
    description:
      "即時查詢全臺各縣市氣象站紫外線指數 (UV Index)，提供紫外線曝曬防護分級（低量、中量、高量、過量、極高量）與專業防曬係數與配件建議。",
    directAnswer:
      "紫外線指數 (UV Index) 是衡量太陽紫外線到達地表輻射強度的國際指標。中央氣象署依數值分為 5 級：0-2 低量（綠）、3-5 中量（黃）、6-7 高量（橘）、8-10 過量（紅）、11+ 極高量（紫）。",
    scientificBasis: [
      {
        title: "紫外線指數防護分級與監測標準",
        authority: "交通部中央氣象署 (CWA)",
        url: "https://www.cwa.gov.tw",
      },
      {
        title: "紫外線健康影響與防曬衛教指引",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw",
      },
      {
        title: "Global Solar UV Index - A Practical Guide",
        authority: "世界衛生組織 (WHO)",
        url: "https://www.who.int/publications/i/item/9241590076",
      },
    ],
    referenceTable: {
      title: "中央氣象署紫外線指數 (UVI) 分級與防護對照表",
      headers: ["指數範圍", "分級名稱", "代表燈號", "曬傷時間", "戶外防護建議"],
      rows: [
        [
          "0 - 2",
          "低量級 (Low)",
          "綠色 🟢",
          "超過 60 分鐘",
          "正常戶外活動，必要時配戴帽子",
        ],
        [
          "3 - 5",
          "中量級 (Moderate)",
          "黃色 🟡",
          "約 30 - 45 分鐘",
          "塗抹 SPF15+ 防曬乳、配戴遮陽帽與太陽眼鏡",
        ],
        [
          "6 - 7",
          "高量級 (High)",
          "橘色 🟠",
          "約 20 - 30 分鐘",
          "塗抹 SPF30+ 防曬乳、撐遮陽傘、戴太陽眼鏡並尋找遮蔭處",
        ],
        [
          "8 - 10",
          "過量級 (Very High)",
          "紅色 🔴",
          "約 15 - 20 分鐘",
          "10:00-14:00 儘量避免在烈日下曝曬，必備防曬裝備",
        ],
        [
          "11+",
          "極高量級 (Extreme)",
          "紫色 🟣",
          "小於 15 分鐘",
          "危險級曝曬，應儘量避免外出，外出必備全面防曬與長袖長褲",
        ],
      ],
    },
    relatedSlugs: ["aqi", "water", "earthquakes"],
    faqs: [
      {
        question: "紫外線指數分級標準為何？",
        answer:
          "依中央氣象署與環境部標準：0-2 為低量級（綠色）、3-5 為中量級（黃色）、6-7 為高量級（橘色）、8-10 為過量級（紅色）、11 以上為極高量級（紫色）。",
      },
      {
        question: "過量級與極高量級應該如何防範？",
        answer:
          "當紫外線達到過量級（8-10）或極高量級（11+）時，曬傷時間約僅需 15-20 分鐘，建議儘量避免在上午 10 時至下午 2 時過度曝曬，戶外活動務必塗抹 SPF30+ 防曬乳、配戴帽子與太陽眼鏡。",
      },
      {
        question: "資料來源與更新頻率？",
        answer:
          "本站紫外線資料同步自交通部中央氣象署全臺各地面氣象觀測站即時監測數據，每小時自動連線校對最新數值。",
      },
    ],
  },
  {
    slug: "earthquakes",
    group: "disaster-alerts",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "臺灣與全球顯著地震查詢",
    keywords: ["地震", "地震速報", "震度", "海嘯"],
    description:
      "即時查詢近 7 天全臺 M4.0+ 與全球 M6.0+ 顯著地震動態資訊，包含震央地點、規模大小、震源深度與海嘯警報提示，整合中央氣象署 (CWA) 與美國地質調查局 (USGS) 測報數據。",
    directAnswer:
      "本站即時整合中央氣象署 (CWA) 與美國地質調查局 (USGS) 測報，提供近 7 天全臺 M4.0+ 與全球 M6.0+ 顯著強震、震源深度與海嘯警報 (Tsunami Warning) 即時資訊。",
    scientificBasis: [
      {
        title: "地震觀測與海嘯警報發布標準",
        authority: "交通部中央氣象署地震測報中心",
        url: "https://www.cwa.gov.tw",
      },
      {
        title: "Real-time Earthquake Feeds & Global Seismology",
        authority: "美國地質調查局 (USGS)",
        url: "https://earthquake.usgs.gov",
      },
      {
        title: "防震避難指引與防災整備須知",
        authority: "內政部消防署",
        url: "https://www.nfa.gov.tw",
      },
    ],
    relatedSlugs: ["uv", "aqi", "emergency-supplies", "global-watch"],
    faqs: [
      {
        question: "地震資料多久更新一次？",
        answer:
          "本站地震資料每 10 分鐘自動同步一次中央氣象署 (CWA) 與美國地質調查局 (USGS) 的最新測報，EMSC、HKO 則作為輔助校對來源。",
      },
      {
        question: "為什麼有的地震規模不到 M6.0 也會顯示？",
        answer:
          "臺灣地區 M4.0 以上、經中央氣象署發布地震報告的事件會個別顯示；非臺灣地區則以全球 M6.0（芮氏規模 6.0）以上的顯著地震為主，能量巨大且影響範圍廣，優先提供即時防災參考。",
      },
      {
        question: "海嘯警報標籤代表什麼？",
        answer:
          "當測報單位發布海嘯警報或海嘯觀察提示時，系統會自動在卡片上標示紅色的海嘯警戒警示，提示沿海地區居民注意防範。",
      },
    ],
  },
  {
    slug: "bmi",
    group: "health-assessment",
    lastUpdated: "2026-10-12",

    title: "BMI 計算器",
    keywords: ["肥胖", "身體質量指數", "體重", "過重"],
    description:
      "免費線上 BMI 身體質量指數計算器，輸入身高與體重即可立即計算您的 BMI 值，並對照臺灣衛生福利部國民健康署標準，了解過輕、正常、過重或肥胖的健康風險。",
    directAnswer:
      "BMI（身體質量指數）＝體重(kg) ÷ 身高(m)²。衛福部國健署標準：BMI < 18.5 為過輕，18.5–24 為正常健康體重，24–27 為過重，≥ 27 為肥胖。",
    scientificBasis: [
      {
        title: "成人肥胖定義與健康體重指標",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw",
      },
      {
        title: "Body mass index - BMI classification guidelines",
        authority: "世界衛生組織 (WHO)",
        url: "https://www.who.int",
      },
    ],
    formula: "BMI = 體重 (kg) / [身高 (m)]²",
    referenceTable: {
      title: "臺灣國健署與 WHO 身體質量指數 (BMI) 標準對照表",
      headers: [
        "BMI 數值範圍 (國健署)",
        "體重狀態分類",
        "國際 WHO 標準",
        "相關健康與代謝風險",
      ],
      rows: [
        ["< 18.5", "體重過輕", "< 18.5", "免疫力低下、骨質疏鬆及營養不良風險"],
        [
          "18.5 ≤ BMI < 24",
          "正常健康體重",
          "18.5 ≤ BMI < 25",
          "罹病率與死亡率最低之黃金標準區間",
        ],
        [
          "24 ≤ BMI < 27",
          "過重 (Overweight)",
          "25 ≤ BMI < 30",
          "心血管疾病、糖尿病與脂肪肝初期風險上升",
        ],
        [
          "27 ≤ BMI < 30",
          "輕度肥胖 (Class I)",
          "30 ≤ BMI < 35",
          "代謝症候群、高血壓及高血脂高風險",
        ],
        [
          "30 ≤ BMI < 35",
          "中度肥胖 (Class II)",
          "35 ≤ BMI < 40",
          "心血管疾病與關節負擔顯著增加",
        ],
        [
          "BMI ≥ 35",
          "重度肥胖 (Class III)",
          "BMI ≥ 40",
          "極高心血管疾病與代謝共病風險",
        ],
      ],
    },
    relatedSlugs: ["calories", "body-fat", "waist-hip", "lbm", "nutrition"],
    faqs: [
      {
        question: "BMI 是怎麼計算的？",
        answer:
          "BMI（身體質量指數）＝體重（公斤）÷ 身高（公尺）的平方。例如身高170公分、體重65公斤，BMI ＝ 65 ÷ (1.7 × 1.7) ≈ 22.5。",
      },
      {
        question: "臺灣的 BMI 標準範圍是多少？",
        answer:
          "依衛福部國健署標準：BMI < 18.5 為過輕，18.5–24 為正常範圍，24–27 為過重，27 以上為肥胖，與 WHO 的國際標準（正常上限 25）略有不同。",
      },
      {
        question: "BMI 正常就代表健康嗎？",
        answer:
          "BMI 只反映體重與身高的比例，無法區分肌肉與脂肪比例，運動員或肌肉量高的人可能BMI偏高但體脂率正常。建議搭配體脂率、腰臀比等指標一起評估。",
      },
    ],
  },
  {
    slug: "calories",
    group: "health-assessment",
    lastUpdated: "2026-10-12",

    title: "卡路里需求計算器",
    keywords: ["熱量", "基礎代謝率", "BMR", "TDEE", "減重"],
    description:
      "根據年齡、性別、身高、體重與活動量，採用 Mifflin-St Jeor 公式計算每日所需熱量攝取 (BMR/TDEE)。",
    directAnswer:
      "BMR（基礎代謝率）是人體維持生命最低熱量；TDEE（每日總消耗熱量）為 BMR 乘上活動量係數。本工具採用國際公認之 Mifflin-St Jeor 公式精確推算。",
    scientificBasis: [
      {
        title:
          "A new predictive equation for resting energy expenditure in healthy individuals (Mifflin-St Jeor Formula)",
        authority: "American Journal of Clinical Nutrition (1990)",
        url: "https://pubmed.ncbi.nlm.nih.gov/2305711/",
      },
      {
        title: "國人膳食營養素參考攝取量 (DRIs) 每日熱量建議",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw",
      },
    ],
    formula:
      "男性 BMR = 10×體重(kg) + 6.25×身高(cm) - 5×年齡 + 5；女性 BMR = 10×體重(kg) + 6.25×身高(cm) - 5×年齡 - 161；TDEE = BMR × 活動量係數 (1.2 ~ 1.9)",
    referenceTable: {
      title: "生活活動強度與 TDEE 活動量係數 (PAL) 對照表",
      headers: [
        "生活活動強度",
        "活動係數 (PAL)",
        "生活與運動型態說明",
        "熱量計算公式",
      ],
      rows: [
        [
          "久坐少動 (Sedentary)",
          "1.20",
          "辦公室內勤、幾乎無規律運動",
          "TDEE = BMR × 1.20",
        ],
        [
          "輕度活動 (Light)",
          "1.375",
          "每週輕度運動 1-3 天 (如散步、瑜珈)",
          "TDEE = BMR × 1.375",
        ],
        [
          "中度活動 (Moderate)",
          "1.55",
          "每週中強度運動 3-5 天 (如慢跑、健身)",
          "TDEE = BMR × 1.55",
        ],
        [
          "高度活躍 (Active)",
          "1.725",
          "每週高強度運動 6-7 天 (重度訓練)",
          "TDEE = BMR × 1.725",
        ],
        [
          "極高活動 (Extreme)",
          "1.90",
          "重體力勞動者或每日雙練專業運動員",
          "TDEE = BMR × 1.90",
        ],
      ],
    },
    relatedSlugs: ["bmi", "nutrition", "body-fat", "water", "lbm"],
    faqs: [
      {
        question: "BMR 和 TDEE 有什麼差別？",
        answer:
          "BMR（基礎代謝率）是身體在完全靜止狀態下維持生命所需的最低熱量；TDEE（每日總消耗熱量）則是 BMR 再乘上活動量係數，反映實際生活中消耗的總熱量。",
      },
      {
        question: "為什麼用 Mifflin-St Jeor 公式？",
        answer:
          "Mifflin-St Jeor 公式是目前研究上公認準確度較高的 BMR 估算公式之一，比舊式的 Harris-Benedict 公式更貼近現代人的身體組成。",
      },
      {
        question: "想減重應該攝取多少熱量？",
        answer:
          "一般建議在 TDEE 基礎上減少 300–500 大卡，可達到每週約 0.25–0.5 公斤的溫和減重速度，避免熱量赤字過大影響代謝與肌肉量。",
      },
    ],
  },
  {
    slug: "nutrition",
    group: "health-assessment",
    lastUpdated: "2026-10-12",

    title: "每日營養素建議計算器",
    keywords: ["營養素", "三大營養素", "蛋白質碳水脂肪"],
    description:
      "依據個人體型、活動量與飲食目標，提供每日三大營養素（蛋白質、碳水化合物、脂肪）攝取建議。",
    directAnswer:
      "每日三大營養素（蛋白質、碳水化合物、脂肪）建議依熱量佔比分配：蛋白質 10–35%、碳水化合物 45–65%、脂肪 20–35%。增肌階段建議蛋白質每公斤體重 1.6–2.2 公克。",
    scientificBasis: [
      {
        title: "國人膳食營養素參考攝取量 (DRIs) 第八版",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw",
      },
      {
        title: "Dietary Guidelines for Americans",
        authority: "USDA / HHS",
        url: "https://www.dietaryguidelines.gov",
      },
    ],
    formula:
      "三大營養素克數 = (總熱量 × 佔比%) / 每克熱量 (蛋白質4kcal/g, 碳水4kcal/g, 脂肪9kcal/g)",
    relatedSlugs: ["calories", "food-nutrition", "bmi", "body-fat", "health-supplements"],
    faqs: [
      {
        question: "三大營養素的建議比例是多少？",
        answer:
          "依飲食目標而異，一般均衡飲食常見比例約為碳水化合物 45–65%、蛋白質 10–35%、脂肪 20–35%（以熱量佔比計算），本工具會依您的目標（增肌、減脂、維持）調整比例。",
      },
      {
        question: "增肌需要吃多少蛋白質？",
        answer:
          "增肌階段建議每公斤體重攝取約 1.6–2.2 公克蛋白質，一般日常維持則約 0.8–1.2 公克/公斤即可。",
      },
    ],
  },
  {
    slug: "water",
    group: "health-assessment",
    lastUpdated: "2026-10-12",

    title: "飲水量計算器",
    keywords: ["喝水量", "補水", "水分攝取"],
    description:
      "依體重與活動量計算每日建議飲水量，並提供分段補水時間表，幫助您養成良好的補水習慣。",
    directAnswer:
      "健康成年人每日基礎建議飲水量為體重(kg) × 30–35 毫升（如 60kg 約 1800–2100 ml）。運動大量流汗或高溫環境需依排汗量額外補充 500–1000 ml。",
    scientificBasis: [
      {
        title: "水分攝取與成人健康促進指引",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw",
      },
      {
        title:
          "Dietary Reference Intakes for Water, Potassium, Sodium, Chloride, and Sulfate",
        authority: "National Academies of Sciences, Engineering, and Medicine",
        url: "https://www.nationalacademies.org",
      },
    ],
    formula:
      "每日基本飲水量 (ml) = 體重 (kg) × 30 ~ 35 (運動每 30 分鐘額外補充 250 ~ 500 ml)",
    relatedSlugs: ["calories", "uv", "aqi", "heart-rate"],
    faqs: [
      {
        question: "每天應該喝多少水？",
        answer:
          "常見估算方式為體重（公斤）乘以 30–35 毫升，再依運動量、氣溫等因素調整；例如 60 公斤的人約需 1800–2100 毫升。",
      },
      {
        question: "喝咖啡或茶算在飲水量裡嗎？",
        answer:
          "含咖啡因飲品有輕微利尿作用，建議仍以白開水為主要補水來源，咖啡、茶等飲品可作為額外攝取，不宜完全取代飲水。",
      },
    ],
  },
  {
    slug: "body-fat",
    group: "health-assessment",
    lastUpdated: "2026-10-12",

    title: "體脂率計算器",
    keywords: ["體脂", "體脂率", "海軍體脂法"],
    description:
      "採用美國海軍體脂計算法（Navy Method），計算體脂率、脂肪質量與肌肉量，對照 ACSM 標準分類。",
    directAnswer:
      "美國海軍體脂計算法（Navy Tape Method）透過頸圍、腰圍、臀圍與身高對數迴歸估算體脂率。ACSM 標準成年男性健康體脂率為 10–20%，女性為 18–28%。",
    scientificBasis: [
      {
        title:
          "Department of Defense Physical Fitness and Body Fat Program (US Navy Method)",
        authority: "U.S. Department of Defense / Hodgdon & Beckett (1984)",
        url: "https://www.defense.gov",
      },
      {
        title: "ACSM's Guidelines for Exercise Testing and Prescription",
        authority: "American College of Sports Medicine (ACSM)",
        url: "https://www.acsm.org",
      },
    ],
    formula:
      "男性: 495 / (1.0324 - 0.19077 × log10(腰圍-頸圍) + 0.15456 × log10(身高)) - 450；女性: 495 / (1.29579 - 0.35004 × log10(腰圍+臀圍-頸圍) + 0.22100 × log10(身高)) - 450",
    relatedSlugs: ["bmi", "lbm", "waist-hip", "calories"],
    faqs: [
      {
        question: "Navy Method 怎麼測量體脂率？",
        answer:
          "美國海軍體脂公式利用頸圍、腰圍（女性另加臀圍）與身高，透過對數迴歸公式估算體脂率，不需要體脂計等器材，是一種便於居家自我評估的方式。",
      },
      {
        question: "體脂率多少算正常？",
        answer:
          "依 ACSM 標準，成年男性健康體脂率約 10–20%，成年女性約 18–28%，實際標準會依年齡略有調整。",
      },
    ],
  },
  {
    slug: "waist-hip",
    group: "health-assessment",
    lastUpdated: "2026-10-12",

    title: "腰臀比計算器",
    keywords: ["腰臀比", "腹部肥胖", "WHR"],
    description: "計算腰臀比（WHR），依 WHO 標準評估腹部肥胖與心血管代謝風險。",
    directAnswer:
      "腰臀比（WHR）＝腰圍 ÷ 臀圍。世界衛生組織（WHO）與衛福部國健署標準：男性 WHR ≥ 0.90、女性 WHR ≥ 0.85 即為中心型（腹部）肥胖，心血管與糖尿病風險顯著增加。",
    scientificBasis: [
      {
        title:
          "Waist Circumference and Waist-Hip Ratio: Report of a WHO Expert Consultation",
        authority: "世界衛生組織 (WHO)",
        url: "https://www.who.int/publications/i/item/9789241501491",
      },
      {
        title: "代謝症候群判定標準與腰圍警戒值",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw",
      },
    ],
    formula: "WHR = 腰圍 (cm) / 臀圍 (cm)",
    referenceTable: {
      title: "WHO 與國健署腰臀比 (WHR) 風險對照表",
      headers: [
        "性別",
        "正常健康範圍",
        "中心型肥胖 (高風險門檻)",
        "臨床健康評估意義",
      ],
      rows: [
        [
          "成年男性 (Men)",
          "WHR < 0.90",
          "WHR ≥ 0.90",
          "腹部內臟脂肪過多，增加冠心病與高血壓機率",
        ],
        [
          "成年女性 (Women)",
          "WHR < 0.85",
          "WHR ≥ 0.85",
          "內臟脂肪堆積，提高第2型糖尿病與代謝症候群風險",
        ],
      ],
    },
    relatedSlugs: ["bmi", "body-fat", "blood-pressure", "calories"],
    faqs: [
      {
        question: "腰臀比（WHR）如何計算？",
        answer:
          "WHR ＝ 腰圍 ÷ 臀圍（單位需一致，如皆為公分）。例如腰圍80公分、臀圍100公分，WHR ＝ 0.8。",
      },
      {
        question: "腰臀比多少代表風險較高？",
        answer:
          "依 WHO 標準，男性 WHR 超過 0.90、女性超過 0.85，即屬於腹部肥胖，心血管與代謝疾病風險相對較高。",
      },
    ],
  },
  {
    slug: "heart-rate",
    group: "health-assessment",
    lastUpdated: "2026-10-12",

    title: "目標心率計算器",
    keywords: ["心率區間", "運動強度", "Karvonen"],
    description:
      "使用 Karvonen 公式計算 5 個運動強度心率區間，幫助您精準控制訓練強度，支援手動輸入 Apple Watch、iPhone 健康 App 記錄的靜止心率。",
    directAnswer:
      "Karvonen 儲備心率公式：目標心率 ＝ (最大心率 − 安靜心率) × 運動強度% ＋ 安靜心率。能依個人基礎心肺狀態精準劃分 5 大運動訓練區間（燃脂、有氧、無氧等）。",
    scientificBasis: [
      {
        title:
          "The effects of training on heart rate; a longitudinal study (Karvonen Formula)",
        authority: "Ann Med Exp Biol Fenn (1957)",
        url: "https://pubmed.ncbi.nlm.nih.gov/13470504/",
      },
      {
        title: "全民運動與心肺耐力訓練指引",
        authority: "衛生福利部國民健康署 / 教育部體育署",
        url: "https://www.hpa.gov.tw",
      },
    ],
    formula:
      "目標心率 (Target HR) = (最大心率 - 安靜心率) × 強度百分比 + 安靜心率 （其中最大心率估算為 220 - 年齡）",
    referenceTable: {
      title: "Karvonen 運動強度 5 大心率區間 (Heart Rate Zones) 對照表",
      headers: [
        "運動心率區間",
        "強度百分比 (%HRR)",
        "主要訓練生理效益",
        "主觀運動自覺強度 (RPE)",
      ],
      rows: [
        [
          "Zone 1 暖身與恢復",
          "50% - 60%",
          "促進血液循環、動態恢復、代謝乳酸廢物",
          "非常輕鬆，呼吸平穩，可暢所欲言",
        ],
        [
          "Zone 2 基礎有氧燃脂",
          "60% - 70%",
          "提升粒線體密度、最大脂肪氧化消耗率",
          "微喘舒適，仍可維持完整句子對話",
        ],
        [
          "Zone 3 有氧耐力提升",
          "70% - 80%",
          "增強心肌收縮力、心輸出量與心肺耐力",
          "呼吸明顯加深，說話略顯吃力短促",
        ],
        [
          "Zone 4 無氧乳酸閾值",
          "80% - 90%",
          "提升乳酸清除率、無氧抗疲勞能力",
          "非常吃力，呼吸急促，無法連續交談",
        ],
        [
          "Zone 5 最大攝氧量衝刺",
          "90% - 100%",
          "刺激神經肌肉極限與最大攝氧量 (VO2Max)",
          "全力竭盡衝刺，僅能維持 30-60 秒",
        ],
      ],
    },
    relatedSlugs: ["vo2max", "blood-pressure", "calories", "water"],
    faqs: [
      {
        question: "Karvonen 公式和一般的「220減年齡」有什麼不同？",
        answer:
          "Karvonen 公式額外納入安靜心率（儲備心率），比單純「220−年齡」的最大心率估算法更能反映個人心肺基礎狀態，計算出的目標心率區間也更準確。",
      },
      {
        question: "5 個心率區間分別對應什麼訓練效果？",
        answer:
          "由低到高依序約對應：恢復／熱身、燃脂、有氧耐力、無氧閾值、最大攝氧量訓練，可依訓練目的選擇對應區間維持運動強度。",
      },
      {
        question: "可以用 Apple Watch 或 iPhone 健康 App 的心率資料嗎？",
        answer:
          "可以。網頁無法直接讀取 Apple Watch 或 iPhone 健康 App 的 HealthKit 資料，但您可以在 Apple Watch 或健康 App 上查看目前的靜止心率，手動輸入到本工具即可計算目標心率區間，不需自行把脈量測。",
      },
    ],
  },
  {
    slug: "blood-pressure",
    group: "health-assessment",
    lastUpdated: "2026-10-12",

    title: "血壓分析器",
    keywords: ["高血壓", "血壓標準", "722原則"],
    description:
      "依 2023 ESH 高血壓指南分類血壓等級，支援多次記錄與平均值分析，提供個人化生活建議。",
    directAnswer:
      "依 2023 歐洲高血壓學會（ESH）與臺灣高血壓學會標準：收縮壓 < 120 且舒張壓 < 80 mmHg 為最佳血壓；≥ 140/90 mmHg 為高血壓。建議採居家 722 原則連續量測取平均值。",
    scientificBasis: [
      {
        title:
          "2023 ESH Guidelines for the management of arterial hypertension",
        authority: "European Society of Hypertension (ESH)",
        url: "https://journals.lww.com/jhypertension/fulltext/2023/12000/2023_esh_guidelines_for_the_management_of.2.aspx",
      },
      {
        title: "2022 臺灣高血壓指引與居家 722 血壓量測規範",
        authority: "臺灣高血壓學會 (THS) / 中華民國心臟學會 (TSOC)",
        url: "https://www.hpa.gov.tw",
      },
    ],
    referenceTable: {
      title: "2023 ESH / 臺灣指引成年人血壓分級標準表",
      headers: [
        "血壓分級名稱",
        "收縮壓 (mmHg)",
        "舒張壓 (mmHg)",
        "臨床建議與生活介入指引",
      ],
      rows: [
        [
          "最佳標準血壓 (Optimal)",
          "< 120",
          "且 < 80",
          "健康理想狀態，維持規律運動與低鈉作息",
        ],
        [
          "正常血壓 (Normal)",
          "120 - 129",
          "和/或 80 - 84",
          "正常範圍，建議維持健康作息，每年定期量測",
        ],
        [
          "正常偏高 (High-normal)",
          "130 - 139",
          "和/或 85 - 89",
          "高血壓前期，建議啟動生活型態調整（減重、少鹽）",
        ],
        [
          "第 1 期高血壓 (Grade 1)",
          "140 - 159",
          "和/或 90 - 99",
          "確診高血壓，請諮詢心臟或家醫科醫師評估治療",
        ],
        [
          "第 2 期高血壓 (Grade 2)",
          "160 - 179",
          "和/或 100 - 109",
          "中重度高血壓，需積極就醫藥物控制與長期追蹤",
        ],
        [
          "第 3 期高血壓 (Grade 3)",
          "≥ 180",
          "和/或 ≥ 110",
          "重度危險高血壓，應儘速就診防範心血管急性病變",
        ],
        [
          "單純收縮期高血壓 (ISH)",
          "≥ 140",
          "且 < 90",
          "常見於年長者血管硬化，應就醫評估心血管風險",
        ],
      ],
    },
    relatedSlugs: ["heart-rate", "bmi", "waist-hip", "clinics"],
    faqs: [
      {
        question: "血壓多少算高血壓？",
        answer:
          "依 2023 ESH（歐洲高血壓學會）指南，收縮壓 ≥140 mmHg 或舒張壓 ≥90 mmHg 即達高血壓標準；120–139/70–89 mmHg 屬於「正常偏高」，需留意生活型態調整。",
      },
      {
        question: "為什麼要記錄多次血壓再平均？",
        answer:
          "單次血壓測量易受當下情緒、活動、白袍效應等因素影響，多次測量取平均值能更準確反映真實血壓狀況，這也是臨床診斷高血壓的建議做法。",
      },
    ],
  },
  {
    slug: "sleep",
    group: "health-assessment",
    lastUpdated: "2026-10-12",

    title: "睡眠品質評估",
    keywords: ["睡眠品質", "失眠", "PSQI"],
    description:
      "基於 PSQI 量表 7 個面向，評估您的睡眠狀況並提供科學化睡眠衛生改善建議，可搭配 Apple Watch、iPhone 睡眠追蹤紀錄回答更準確。",
    directAnswer:
      "匹茲堡睡眠品質指數（PSQI）涵蓋 7 大面向（入睡時間、時數、效率等）。總分 0–21 分，臨床切點以 PSQI > 5 分代表睡眠品質不佳，需留意睡眠障礙或精神壓力。",
    scientificBasis: [
      {
        title:
          "The Pittsburgh Sleep Quality Index: a new instrument for psychiatric practice and research (Buysse et al., 1989)",
        authority: "Psychiatry Research (NIH/PubMed)",
        url: "https://pubmed.ncbi.nlm.nih.gov/2748771/",
      },
      {
        title: "健康睡眠衛生指引與失眠防治衛教",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw",
      },
    ],
    relatedSlugs: ["stress", "heart-rate", "blood-pressure", "mental-health"],
    faqs: [
      {
        question: "PSQI 量表評估哪些面向？",
        answer:
          "匹茲堡睡眠品質指數（PSQI）涵蓋主觀睡眠品質、入睡時間、睡眠時數、睡眠效率、睡眠困擾、使用助眠藥物、日間功能障礙共 7 個面向。",
      },
      {
        question: "PSQI 分數多少代表睡眠品質不佳？",
        answer:
          "PSQI 總分範圍為 0–21 分，一般以總分超過 5 分視為睡眠品質不佳的臨床切點。",
      },
      {
        question: "可以用 Apple Watch 或 iPhone 睡眠追蹤的資料回答問卷嗎？",
        answer:
          "可以。若有使用 Apple Watch 或 iPhone「健康」App 的睡眠追蹤功能，可先查看其記錄的平均睡眠時數與入睡所需時間，作為回答對應題目的參考依據，讓評估結果更準確。",
      },
    ],
  },
  {
    slug: "stress",
    group: "health-assessment",
    lastUpdated: "2026-10-12",

    title: "壓力評估測驗",
    keywords: ["壓力測驗", "知覺壓力", "PSS"],
    description:
      "採用 PSS-10 知覺壓力量表，10 道題目量化壓力程度，提供個人化減壓策略。",
    directAnswer:
      "PSS-10（知覺壓力量表）是國際評估主觀心理壓力的黃金標準。共 10 題（總分 0–40 分）：0-13 分為低壓力、14-26 分為中度壓力、27-40 分為高度知覺壓力。",
    scientificBasis: [
      {
        title:
          "A global measure of perceived stress (Cohen et al., 1983 - PSS-10)",
        authority: "Journal of Health and Social Behavior (PubMed)",
        url: "https://pubmed.ncbi.nlm.nih.gov/6668417/",
      },
      {
        title: "心快活 - 心理健康學習與壓力自我調適平臺",
        authority: "衛生福利部心理健康司",
        url: "https://wellbeing.mohw.gov.tw",
      },
    ],
    relatedSlugs: ["sleep", "heart-rate", "blood-pressure", "mental-health"],
    faqs: [
      {
        question: "PSS-10 是什麼？",
        answer:
          "PSS-10（Perceived Stress Scale）是國際廣泛使用的知覺壓力量表，透過 10 道題目評估最近一個月內個人感受到的壓力程度，分數越高代表主觀壓力感越大。",
      },
    ],
  },
  {
    slug: "lbm",
    group: "health-assessment",
    lastUpdated: "2026-10-12",

    title: "去脂體重 (LBM) 計算器",
    keywords: ["去脂體重", "肌肉量", "瘦體重"],
    description: "以 Boer 公式估算去脂體重與體脂率，全面了解您的身體組成狀況。",
    directAnswer:
      "去脂體重（LBM）是指扣除脂肪後的體重淨重（肌肉、骨骼、器官與水分）。本工具採用經典 Boer 公式估算，是運動員及減脂期監控肌肉流失的關鍵指標。",
    scientificBasis: [
      {
        title:
          "Estimated lean body mass as an index for normalization of body composition (Boer P, 1984)",
        authority: "American Journal of Physiology",
        url: "https://pubmed.ncbi.nlm.nih.gov/6731682/",
      },
      {
        title: "人體組成分析與肌肉量評估指引",
        authority: "國家衛生研究院 (NHRI)",
        url: "https://www.nhri.edu.tw",
      },
    ],
    formula:
      "男性 LBM = (0.407 × 體重kg) + (0.267 × 身高cm) - 19.2；女性 LBM = (0.252 × 體重kg) + (0.473 × 身高cm) - 48.3",
    relatedSlugs: ["body-fat", "bmi", "calories", "nutrition"],
    faqs: [
      {
        question: "去脂體重（LBM）是什麼？",
        answer:
          "去脂體重指扣除脂肪後的體重，包含肌肉、骨骼、器官與水分等，是評估身體組成、肌肉量變化的重要指標。",
      },
      {
        question: "Boer 公式怎麼計算 LBM？",
        answer:
          "Boer 公式依性別、身高、體重推算去脂體重，男性與女性各有不同係數，是常用且相對簡便的人體組成估算方式之一。",
      },
    ],
  },
  {
    slug: "vo2max",
    group: "health-assessment",
    lastUpdated: "2026-10-12",

    title: "VO2Max 估算器",
    keywords: ["最大攝氧量", "心肺耐力"],
    description:
      "輸入年齡與安靜心率，以 Uth 公式快速評估最大攝氧量（VO2Max），對照 ACSM 標準了解您的心肺耐力等級，安靜心率可直接參考 Apple Watch 或 iPhone 健康 App 的紀錄。",
    directAnswer:
      "最大攝氧量（VO2Max）是評估心肺耐力與有氧運動能力的最高標準。本工具採用 Uth 靜止心率公式估算：VO2Max ＝ 15.3 × (最大心率 ÷ 安靜心率)，可手動輸入 Apple Watch 數據。",
    scientificBasis: [
      {
        title:
          "Estimation of VO2max from the ratio between HRmax and HRrest (Uth et al., 2004)",
        authority: "European Journal of Applied Physiology (PubMed)",
        url: "https://pubmed.ncbi.nlm.nih.gov/14624296/",
      },
      {
        title: "國民體適能檢測與心肺耐力評估指引",
        authority: "教育部體育署 / 衛福部國健署",
        url: "https://www.sports.taiwan.gov.tw",
      },
    ],
    formula:
      "VO2Max (ml/kg/min) = 15.3 × (HRmax / HRrest) （其中 HRmax = 220 - 年齡）",
    relatedSlugs: ["heart-rate", "calories", "lbm", "body-fat"],
    faqs: [
      {
        question: "VO2Max 代表什麼？",
        answer:
          "VO2Max（最大攝氧量）是身體在最大運動強度下每分鐘每公斤體重能利用的最大氧氣量，是評估心肺耐力與有氧運動能力的重要指標。",
      },
      {
        question: "不用實際運動測試也能估算 VO2Max 嗎？",
        answer:
          "Uth 公式只需安靜心率與最大心率（依年齡估算）即可快速推估 VO2Max，準確度不如實驗室測試，但適合作為日常心肺耐力的初步參考。",
      },
      {
        question: "Apple Watch 本身就會估算 VO2Max，跟這個工具的結果一樣嗎？",
        answer:
          "不一定相同。Apple Watch 是用戶外健走或跑步時的心率與速度資料估算 VO2Max，本工具則是用安靜心率套用 Uth 公式粗估，兩者演算法不同，數字可能有落差；安靜心率本身則可直接參考 Apple Watch 或 iPhone 健康 App 的紀錄，手動輸入即可。",
      },
    ],
  },
  {
    slug: "aqi",
    group: "environment-food",
    lastUpdated: "2026-10-12",

    title: "AQI 空氣品質即時查詢",
    keywords: ["空氣品質", "PM2.5", "懸浮微粒"],
    description:
      "即時顯示全臺環境部監測站 AQI 空氣品質指標，包含 PM2.5、PM10 等污染物濃度。",
    directAnswer:
      "即時連線環境部全臺監測站，提供 AQI 指標與 PM2.5/PM10 濃度。分級：0-50 良好（綠）、51-100 普通（黃）、101-150 對敏感族群不健康（橘）、151-200 對所有族群不健康（紅）。",
    scientificBasis: [
      {
        title: "空氣品質指標 (AQI) 定義與活動防護指引",
        authority: "環境部 (MOENV)",
        url: "https://airtw.moenv.gov.tw",
      },
      {
        title: "細懸浮微粒 (PM2.5) 健康防護衛教手冊",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw",
      },
    ],
    referenceTable: {
      title: "環境部空氣品質指標 (AQI) 與健康防護指引對照表",
      headers: [
        "AQI 指標範圍",
        "狀態分級",
        "代表燈號",
        "對人體健康影響",
        "民眾戶外活動建議",
      ],
      rows: [
        [
          "0 - 50",
          "良好 (Good)",
          "綠色 🟢",
          "空氣品質令人滿意，污染極低",
          "可正常進行戶外活動",
        ],
        [
          "51 - 100",
          "普通 (Moderate)",
          "黃色 🟡",
          "少數極敏感族群可能產生輕微症狀",
          "一般民眾可正常活動，極敏感者留意",
        ],
        [
          "101 - 150",
          "對敏感族群不健康 (Unhealthy for Sensitive Groups)",
          "橘色 🟠",
          "氣喘、心血管與長者可能出現不適",
          "敏感族群應減少戶外劇烈活動並配戴口罩",
        ],
        [
          "151 - 200",
          "對所有族群不健康 (Unhealthy)",
          "紅色 🔴",
          "所有人的健康開始受到影響",
          "一般民眾減少戶外劇烈活動，敏感者留在室內",
        ],
        [
          "201 - 300",
          "非常不健康 (Very Unhealthy)",
          "紫色 🟣",
          "健康警報，嚴重影響呼吸道與心血管",
          "所有人應儘量留在室內，停止戶外運動",
        ],
        [
          "301 - 500",
          "危害 (Hazardous)",
          "褐紅色 🟤",
          "緊急警報，嚴重危及全體民眾健康",
          "全員應避免一切戶外活動並關閉門窗",
        ],
      ],
    },
    relatedSlugs: ["uv", "earthquakes", "water", "iaq-premises", "aqx-monitoring"],
    faqs: [
      {
        question: "AQI 數值如何解讀？",
        answer:
          "AQI（空氣品質指標）數值 0–50 為良好、51–100 普通、101–150 對敏感族群不健康、151–200 對所有族群不健康，數值越高代表空氣污染越嚴重。",
      },
      {
        question: "資料來源是哪裡？",
        answer:
          "資料來自環境部（環保署）全臺各監測站的即時空氣品質觀測資料，每小時定期自動同步更新。",
      },
    ],
  },
  {
    slug: "clinics",
    group: "medical-care",
    lastUpdated: "2026-10-12",

    title: "醫療院所查詢",
    keywords: ["看醫生", "健保診所", "醫院查詢"],
    description: "查詢全民健保特約醫療院所，支援關鍵字搜尋與附近定位。",
    directAnswer:
      "即時查詢全臺近 2 萬家健保特約醫療院所（醫學中心、區域醫院、地區醫院、基層診所），支援關鍵字、科別、縣市與 GPS 距離定位。",
    scientificBasis: [
      {
        title: "全民健康保險特約醫事機構開放名冊",
        authority: "衛生福利部中央健康保險署 (NHI)",
        url: "https://www.nhi.gov.tw",
      },
    ],
    relatedSlugs: ["pharmacies", "long-term-care", "health-checks", "medical-violators"],
    faqs: [
      {
        question: "可以查詢哪些層級的醫療院所？",
        answer:
          "目前收錄全民健保特約的醫學中心、區域醫院、地區醫院及基層診所。",
      },
      {
        question: "資料多久更新一次？",
        answer: "資料來源為衛福部中央健康保險署公開資料，會定期同步更新。",
      },
    ],
  },
  {
    slug: "pharmacies",
    group: "medical-care",
    lastUpdated: "2026-10-12",

    title: "藥局查詢",
    keywords: ["藥房", "健保藥局", "連續處方箋"],
    description: "查詢全臺一般藥局及健保特約藥局，支援關鍵字搜尋與附近定位。",
    directAnswer:
      "查詢全臺 8,000+ 家一般藥局與健保特約藥局，支援慢性病連續處方箋調劑藥局篩選與附近 GPS 定位。",
    scientificBasis: [
      {
        title: "健保特約藥局名冊與醫事機構開放資料",
        authority: "衛生福利部中央健康保險署 (NHI)",
        url: "https://www.nhi.gov.tw",
      },
    ],
    relatedSlugs: ["clinics", "drugs", "long-term-care", "smoking-cessation"],
    faqs: [
      {
        question: "一般藥局跟健保特約藥局有什麼不同？",
        answer:
          "健保特約藥局可受理健保處方箋、提供健保給付的調劑服務；一般藥局則不一定有特約資格，僅能提供成藥銷售等服務。本工具兩者皆有收錄並標示。",
      },
    ],
  },
  {
    slug: "drugs",
    group: "medical-care",
    lastUpdated: "2026-10-12",

    title: "藥品查詢",
    keywords: ["藥品查詢", "許可證字號", "辨識藥品"],
    description:
      "查詢衛福部食藥署核准藥品的許可證字號、中英文品名與外觀特徵，協助辨識藥品。",
    directAnswer:
      "查詢衛福部食藥署核准之中西藥品許可證字號、中英文品名、適應症、劑型、外觀顏色與形狀特徵，協助民眾與專業人員核對藥品資訊。",
    scientificBasis: [
      {
        title: "西藥、醫療器材及化粧品許可證資料庫",
        authority: "衛生福利部食品藥物管理署 (TFDA)",
        url: "https://www.fda.gov.tw",
      },
    ],
    relatedSlugs: ["pharmacies", "food-nutrition", "clinics"],
    faqs: [
      {
        question: "可以查詢哪些藥品資訊？",
        answer:
          "可查詢藥品的許可證字號、中英文品名、劑型、外觀顏色、形狀等資訊，資料來源為衛福部食藥署核准藥品資料庫。",
      },
      {
        question: "這個工具能取代藥師諮詢嗎？",
        answer:
          "不能。本工具僅提供公開資料查詢，實際用藥安全、交互作用等問題仍請諮詢醫師或藥師。",
      },
    ],
  },
  {
    slug: "food-nutrition",
    group: "environment-food",
    lastUpdated: "2026-10-12",

    title: "食品營養成分查詢",
    keywords: ["食物熱量", "食材營養", "食品成分"],
    description:
      "查詢衛福部食藥署食品營養成分資料庫，依食品名稱搜尋熱量、蛋白質、脂肪、碳水化合物等營養成分含量。",
    directAnswer:
      "查詢衛福部食藥署食品營養成分資料庫，分析千種臺灣常見食品與食材之熱量、蛋白質、脂肪、碳水化合物及微量元素含量。",
    scientificBasis: [
      {
        title: "臺灣食品營養成分資料庫 (FDA Food Composition Database)",
        authority: "衛生福利部食品藥物管理署 (TFDA)",
        url: "https://www.fda.gov.tw",
      },
    ],
    relatedSlugs: ["calories", "nutrition", "food-operators", "health-supplements"],
    faqs: [
      {
        question: "營養成分數值是以什麼為單位？",
        answer:
          "資料庫以每100克食品的含量為主，部分品項另提供每單位（如每份、每顆）的含量與對應重量，實際以查詢結果顯示為準。",
      },
      {
        question: "資料來源是什麼？",
        answer:
          "資料來源為衛福部食藥署「食品營養成分資料庫」，收錄臺灣常見食品的實測分析數據，每半年更新一次。",
      },
      {
        question: "可以計算一整份餐點的總營養嗎？",
        answer:
          "可以。「餐點分析」分頁可加入多項食物與各自的重量（克），系統會依比例換算並加總每項營養素，顯示整份餐點的總熱量與各項含量。",
      },
      {
        question: "如何找出某項營養素含量最高的食物？",
        answer:
          "「營養素排行」分頁可選擇一項營養素（如鈉、蛋白質、鈣），依每100克含量由高到低列出食品排行。",
      },
      {
        question: "什麼是健康食品(健字號)？",
        answer:
          "健康食品(健字號)是食藥署依《健康食品管理法》核准、具特定保健功效聲稱的法定分類，與一般市售保健食品不同。「健康食品」分頁可查詢核可品項的許可證字號、保健功效與警語等公開資料。",
      },
    ],
  },
  {
    slug: "food-operators",
    group: "environment-food",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "食品業者登錄查詢",
    keywords: ["食品登錄", "食品業者", "追溯追蹤"],
    description:
      "查詢衛福部食藥署食品業者登錄資料，依公司名稱、統一編號或地址搜尋登錄項目（販售場所、製造場所、餐飲場所等）。",
    directAnswer:
      "查詢衛福部食藥署登錄之食品製造、販售與餐飲業者資訊，依公司名稱、統一編號或地址追溯食品業者合法登錄狀態。",
    scientificBasis: [
      {
        title: "非登不可 - 食品業者登錄平臺公開資料",
        authority: "衛生福利部食品藥物管理署 (TFDA)",
        url: "https://www.fda.gov.tw",
      },
    ],
    relatedSlugs: ["food-nutrition", "green-certifications"],
    faqs: [
      {
        question: "食品業者登錄字號代表什麼？",
        answer:
          "登錄字號是食品業者依食品安全衛生管理法完成「食品業者登錄平臺」登錄後取得的唯一識別碼，用於追溯業者登錄狀態。",
      },
      {
        question: "查不到某業者代表什麼？",
        answer:
          "可能是該業者尚未完成登錄，或登錄名稱與搜尋關鍵字不完全相符，建議嘗試以統一編號或地址關鍵字查詢。",
      },
    ],
  },
  {
    slug: "health-checks",
    group: "medical-care",
    lastUpdated: "2026-10-12",

    title: "健康檢查機構查詢",
    keywords: ["健檢機構", "職業健檢"],
    description:
      "查詢勞工健康檢查認可醫療機構及職業傷病防治網絡醫院，支援關鍵字搜尋與附近定位。",
    directAnswer:
      "查詢勞動部與衛福部認可之勞工體格及健康檢查醫療機構名冊，支援職業傷病防治網絡醫院定位與各縣市認可院所查詢。",
    scientificBasis: [
      {
        title: "勞工體格及健康檢查認可醫療機構名冊",
        authority: "勞動部職業安全衛生署 (OSHA)",
        url: "https://www.osha.gov.tw",
      },
    ],
    relatedSlugs: ["clinics", "long-term-care", "blood-pressure", "smoking-cessation", "rare-disease-care", "medical-violators"],
    faqs: [
      {
        question: "收錄哪些類型的健檢機構？",
        answer:
          "收錄勞動部認可的勞工體格及健康檢查醫療機構，以及職業傷病防治網絡醫院兩類資料。",
      },
    ],
  },
  {
    slug: "long-term-care",
    group: "elder-care-welfare",
    lastUpdated: "2026-10-14",

    navLabel: "長照照顧圈地圖",
    title: "長照照顧圈地圖",
    keywords: [
      "長照機構",
      "長照2.0",
      "長照3.0",
      "照護服務",
      "居家醫療",
      "居家照護",
      "老人福利機構",
      "安養機構",
      "伯公照護站",
      "10分鐘照顧圈",
      "照顧圈",
      "一般護理之家",
      "居家護理所",
    ],
    description:
      "查詢全臺長照資源的「照顧圈地圖」：整合長照2.0特約機構、居家醫療特約機構、老人福利機構與客家委員會伯公照護站四種類型，可切換 1／3／5 公里直線半徑圈，即時顯示圈內資源數量，協助掌握住家附近的長照選擇。",
    directAnswer:
      "長照照顧圈地圖整合長照2.0特約服務機構、居家醫療特約機構、老人福利機構與伯公照護站四類長照資源，支援依機構類型篩選查詢，並提供 1／3／5 公里可切換的直線半徑照顧圈，即時顯示圈內資源數量；半徑為直線距離估算（市區約等於車程 10 分鐘，實際依路況而定），非路徑規劃導航。",
    scientificBasis: [
      {
        title: "長期照顧服務機構管理與許可名冊",
        authority: "衛生福利部長期照顧司",
        url: "https://1966.gov.tw",
      },
      {
        title: "長照 2.0 特約服務單位開放資料",
        authority: "衛生福利部長期照顧司",
        url: "https://1966.gov.tw",
      },
      {
        title: "全民健康保險居家醫療照護整合計畫特約名冊",
        authority: "衛生福利部中央健康保險署 (NHI)",
        url: "https://www.nhi.gov.tw",
      },
      {
        title: "全國老人福利機構一覽表",
        authority: "衛生福利部社會及家庭署 (SFAA)",
        url: "https://www.sfaa.gov.tw",
      },
      {
        title: "客家委員會開放資料 - 伯公照護站名冊",
        authority: "客家委員會 (HAC)",
        url: "https://cloud.hakka.gov.tw/Pub/Opendata/DTST20230600002.json",
      },
      {
        title: "全國開業護理機構清冊（一般護理之家、居家護理所）",
        authority: "衛生福利部護理及健康照護司",
        url: "https://data.gov.tw/dataset/115950",
      },
    ],
    relatedSlugs: ["postpartum-care", "disability-welfare", "senior-friendly", "hearing-aid-subsidies", "organ-donation-hospitals", "home-emergency-care", "funeral-facilities"],
    faqs: [
      {
        question: "長照照顧圈地圖整合哪些類型的長照資源？",
        answer:
          "整合四種類型：長照2.0特約機構（居家服務、日間照顧、喘息服務、住宿式機構、小規模多機能、失智據點、社區照顧關懷據點、一般護理之家、居家護理所等）、全民健保居家醫療照護整合計畫特約機構、衛福部社會及家庭署老人福利機構（安養、養護、長期照護），以及客家委員會伯公照護站。可用上方的類型篩選切換查詢其中任一種，再用「長照2.0特約機構」類型下方的分類篩選縮小到特定機構類別。",
      },
      {
        question: "一般護理之家與居家護理所是什麼時候加入的？跟產後護理之家有什麼關係？",
        answer:
          "衛福部護理及健康照護司「全國開業護理機構清冊」同時收錄一般護理之家、居家護理所與產後護理之家三種機構。產後護理之家（月子中心）已獨立為 /tools/postpartum-care 工具，另兩類則併入本頁「長照2.0特約機構」類型下的分類篩選，可依評鑑結果與合格效期判斷機構是否仍在有效期內。",
      },
      {
        question: "可切換的 1／3／5 公里「照顧圈」半徑是怎麼算的？",
        answer:
          "照顧圈採直線距離（經緯度幾何計算），不呼叫任何路徑規劃或導航服務，因此不會反映實際路況、單行道或山區蜿蜒道路的真實車程；市區平地的直線距離大致約等於 10 分鐘車程，但實際時間仍依路況而定。若目前半徑內查無資源，頁面會提示可嘗試切換至更大的半徑，而不會自動擴大範圍替您顯示較遠的結果。",
      },
      {
        question: "「伯公照護站」是什麼？為什麼併入長照照顧圈地圖？",
        answer:
          "「伯公照護站」是客家委員會配合衛福部長照 2.0 政策，結合客庄在地資源（如社區發展協會、C 級巷弄長照站）推動的據點，融入客語環境、客家歌謠與文化健康活動。因為服務性質與長照社區據點高度重疊，2.0 版改版將其併入本頁作為四種可切換的機構類型之一，不再另立專頁。",
      },
      {
        question: "原本「居家醫療查詢」與「老人福利機構查詢」的網址還能用嗎？",
        answer:
          "會自動永久轉址到本頁，並帶入對應的類型篩選參數（例如原「居家醫療查詢」會直接開啟本頁並選定「居家醫療」類型），收藏的舊網址不會失效。",
      },
    ],
  },
  {
    slug: "disability-welfare",
    group: "elder-care-welfare",
    lastUpdated: "2026-10-12",

    title: "身心障礙福利機構查詢",
    keywords: ["身心障礙機構", "殘障福利", "障礙福利"],
    description:
      "查詢衛福部全國身心障礙福利機構名冊，支援關鍵字搜尋與附近定位。",
    directAnswer:
      "查詢衛福部全國身心障礙福利機構名冊，涵蓋全日型住宿機構、日間照顧機構及身心障礙福利服務中心。",
    scientificBasis: [
      {
        title: "全國身心障礙福利機構一覽表",
        authority: "衛生福利部社會及家庭署 (SFAA)",
        url: "https://www.sfaa.gov.tw",
      },
    ],
    relatedSlugs: ["disability-atm", "long-term-care", "child-welfare-institutions", "sheltered-workshops", "audible-signals"],
    faqs: [
      {
        question: "資料涵蓋哪些身心障礙福利機構？",
        answer:
          "資料來源為衛福部社會及家庭署開放資料「全國身心障礙福利機構一覽表」，涵蓋全臺各類身心障礙福利服務機構。",
      },
    ],
  },
  {
    slug: "disability-atm",
    group: "elder-care-welfare",
    lastUpdated: "2026-10-12",

    navLabel: "無障礙ATM查詢",
    title: "信用合作社無障礙ATM查詢",
    keywords: ["無障礙ATM", "語音ATM", "視障提款"],
    description:
      "查詢全臺信用合作社提供輪椅可及或語音服務的無障礙ATM，支援關鍵字搜尋與附近定位。",
    directAnswer:
      "查詢全臺信用合作社提供輪椅可及或視障語音導引服務之無障礙 ATM 自動櫃員機服務據點。",
    scientificBasis: [
      {
        title: "信用合作社輪椅可及與語音服務無障礙 ATM 名冊",
        authority: "中華民國信用合作社聯合社 / 金管會",
        url: "https://www.cusa.org.tw",
      },
    ],
    relatedSlugs: ["disability-welfare", "long-term-care", "accessible-parking"],
    faqs: [
      {
        question: "資料涵蓋哪些無障礙ATM？",
        answer:
          "資料來源為中華民國信用合作社聯合社的輪椅可及ATM與語音服務ATM名冊，兩份名單依信用合作社分社代號合併，同一分社若同時提供兩種服務會標示為「輪椅可及、語音服務」。",
      },
    ],
  },
  {
    slug: "audible-signals",
    group: "elder-care-welfare",
    lastUpdated: "2026-10-13",

    navLabel: "有聲號誌查詢",
    title: "全國盲人有聲號誌查詢",
    keywords: ["盲人有聲號誌", "行人穿越道語音號誌", "視障號誌", "App觸發號誌"],
    description:
      "查詢全國各縣市盲人有聲號誌（行人穿越道語音號誌）設置路口，顯示路名座標與是否支援 App 觸發，支援關鍵字搜尋與附近定位。",
    directAnswer:
      "查詢全臺各縣市政府設置之盲人有聲號誌（行人穿越道語音號誌）路口位置，並標示該路口是否支援以手機 App 觸發語音播放。",
    scientificBasis: [
      {
        title: "有聲號誌 (Traffic/Road/APS)",
        authority: "交通部 TDX 運輸資料流通服務平台",
        url: "https://tdx.transportdata.tw",
      },
    ],
    relatedSlugs: ["disability-welfare", "disability-atm", "accessible-transit"],
    faqs: [
      {
        question: "有聲號誌和一般行人號誌有什麼不同？",
        answer:
          "有聲號誌會在通行時段播放語音或嗶聲提示，協助視障使用者判斷是否可通行；部分路口另外支援以手機 App（如本工具查詢結果標示「可用App觸發」）主動觸發語音播放，而非全天候自動播放。",
      },
      {
        question: "資料多久更新一次？是否涵蓋全國？",
        answer:
          "資料來源為交通部 TDX 運輸資料流通服務平台的「有聲號誌」基礎服務，由各縣市政府交通主管機關提供並定期更新；本工具會同步全部已開放資料的縣市，若某縣市尚未開放或暫時查詢失敗，僅該縣市資料會缺漏，不影響其他縣市正常顯示。",
      },
    ],
  },
  {
    slug: "accessible-parking",
    group: "elder-care-welfare",
    lastUpdated: "2026-10-13",

    navLabel: "特殊車位查詢",
    title: "孕婦親子／身心障礙／復康巴士車位查詢",
    keywords: ["身心障礙車位", "孕婦親子車位", "復康巴士停車", "無障礙停車位", "愛心車位"],
    description:
      "查詢全台停車場（路外）與路邊停車（路內）的孕婦及親子專用、身心障礙汽車、身心障礙機車與復康巴士專用車位，顯示即時剩餘車位數，支援關鍵字搜尋與附近定位。",
    directAnswer:
      "查詢全臺停車場與路邊停車中的孕婦及親子專用、身心障礙汽車、身心障礙機車、復康巴士這 4 種特殊車位，並顯示每個車位類型的即時剩餘數。",
    scientificBasis: [
      {
        title: "停車資訊 (Parking/OffStreet, Parking/OnStreet)",
        authority: "交通部 TDX 運輸資料流通服務平台",
        url: "https://tdx.transportdata.tw",
      },
    ],
    relatedSlugs: ["disability-atm", "accessible-transit", "audible-signals", "baby-friendly-hospitals"],
    faqs: [
      {
        question: "為什麼有些停車場或路段查不到特殊車位？",
        answer:
          "本工具只保留孕婦及親子專用、身心障礙汽車、身心障礙機車、復康巴士這 4 種車位類型；沒有設置這些車位類型的停車場或路段本來就不會出現在查詢結果中，不代表該處完全沒有停車空間。",
      },
      {
        question: "剩餘車位數多久更新？",
        answer:
          "資料來源為交通部 TDX 運輸資料流通服務平台的「停車資訊」基礎服務，由各縣市政府或停車場管理單位提供即時剩餘車位數，本站會定期同步最新數字；若某縣市或某類車位暫時查詢失敗，僅該部分資料會缺漏，不影響其他縣市或車位類型正常顯示。",
      },
    ],
  },
  {
    slug: "public-toilets",
    group: "life-culture",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "全國公廁查詢",
    keywords: ["公共廁所", "廁所地圖", "找廁所"],
    description: "查詢全國公廁位置、無障礙與親子設施。資料來源：環境部。",
    directAnswer:
      "查詢環境部列管之全國公廁，可依無障礙廁所、親子廁所、性別友善廁所與尿布臺設置情形篩選，並顯示清潔等級與所在位置。",
    scientificBasis: [
      {
        title: "環境部環境資料開放平臺 - 公廁基本資料",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
    ],
    relatedSlugs: ["green-certifications", "disability-atm", "cleaning-squads"],
    faqs: [
      {
        question: "這裡的公廁資料包含哪些類型？",
        answer:
          "涵蓋男廁所、女廁所、混合廁所、無障礙廁所、性別友善廁所與親子廁所，並標示是否設有尿布臺。同一處場所的不同廁所會分開列出，因為無障礙與親子設施的有無各自不同。",
      },
      {
        question: "清潔等級是誰評定的？",
        answer:
          "由環境部依公廁管理維護計畫評定，分為特優級與優等級，資料隨環境部開放資料同步更新。",
      },
    ],
  },
  {
    // issue #256: merged "child-welfare-nurseries" (全國親子館查詢) and
    // "child-welfare-centers" (兒少福利中心查詢) — both are 衛福部社家署
    // 機構名冊查詢 of the same shape, differing only in `facilityType`. The
    // merged page renders both via the existing generic FacilitySearchContent
    // + facilitySearchConfigs["child-welfare-nurseries" | "child-welfare-centers"]
    // (unchanged), switched by a type tab — see ChildWelfareInstitutionsContent.tsx.
    slug: "child-welfare-institutions",
    group: "family",
    lastUpdated: "2026-10-12",

    title: "全國親子館與兒少福利中心查詢",
    keywords: ["親子館", "兒童福利中心", "托育資源中心"],
    description:
      "查詢全國親子館（托育資源中心）與兒童及少年福利服務中心名冊，可切換機構類型查看育兒親子空間或兒少個案輔導據點。資料來源：衛福部社會及家庭署開放資料。",
    directAnswer:
      "整合衛福部社家署全國親子館（托育資源中心）與兒少福利中心名冊，可切換類型查詢學齡前親子遊戲空間，或兒少個案輔導、課後陪伴與家庭支持服務據點。",
    scientificBasis: [
      {
        title: "全國親子館 (托育資源中心) 名冊",
        authority: "衛生福利部社會及家庭署 (SFAA)",
        url: "https://www.sfaa.gov.tw",
      },
      {
        title: "全國兒童及少年福利服務中心名冊",
        authority: "衛生福利部社會及家庭署 (SFAA)",
        url: "https://www.sfaa.gov.tw",
      },
    ],
    relatedSlugs: ["kindergartens", "cram-schools", "disability-welfare"],
    faqs: [
      {
        question: "什麼是親子館（托育資源中心）？",
        answer:
          "親子館為政府補助設置的免費或平價育兒資源場所，提供學齡前幼兒親子活動空間、圖書玩具借閱、育兒諮詢與親職教育課程。切換上方「親子館」類型分頁即可查詢。",
      },
      {
        question: "兒少福利中心提供哪些服務？",
        answer:
          "兒少福利服務中心提供兒童與青少年心理輔導、家庭支持、課後照顧、福利諮詢及兒少權益宣導等多項社會福利服務。切換上方「兒少福利中心」類型分頁即可查詢。",
      },
      {
        question: "這個頁面是否包含原本「全國親子館查詢」與「兒少福利中心查詢」的內容？",
        answer:
          "是。這兩個原本獨立的工具已合併為本頁，原網址皆已 301 轉址於此，資料範圍與更新來源維持不變，僅以類型分頁取代原本的兩個獨立頁面。",
      },
    ],
  },
  {
    slug: "kindergartens",
    group: "family",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "全國幼兒園查詢",
    keywords: ["幼兒園查詢", "托嬰", "幼稚園", "非營利幼兒園", "準公共幼兒園", "幼兒園月費", "幼兒園裁罰紀錄"],
    description:
      "查詢全國公立、私立、準公共與非營利幼兒園名錄，提供核定招收人數、設立許可、地址電話與地圖導航；準公共／非營利分類、月費與裁罰紀錄來自民間轉錄全國教保資訊網（kiang/ap.ece.moe.edu.tw，MIT 授權）。",
    directAnswer:
      "查詢全國公立、私立、準公共與非營利幼兒園名錄，涵蓋設立別、月費、裁罰紀錄、電話與所在地址。",
    scientificBasis: [
      {
        title: "全國幼兒園名錄 (k1_new.json)",
        authority: "教育部統計處 (MOE)",
        url: "https://stats.moe.gov.tw",
      },
      {
        title: "全國教保資訊網民間轉錄 (preschools.json，MIT 授權，非官方 API)",
        authority: "kiang/ap.ece.moe.edu.tw (GitHub, 轉錄自教育部全國教保資訊網)",
        url: "https://ap.ece.moe.edu.tw",
      },
    ],
    relatedSlugs: ["cram-schools", "child-welfare-institutions", "child-native-languages", "childcare-centers"],
    faqs: [
      {
        question: "如何查詢附近的公立、私立、非營利或準公共幼兒園？",
        answer:
          "開啟定位或在搜尋框輸入縣市與幼兒園名稱，可依公立、私立、非營利、準公共進行篩選並在地圖上查看位置。",
      },
      {
        question: "月費、非營利／準公共分類與裁罰紀錄是教育部官方資料嗎？",
        answer:
          "不是。公/私立二分類與基本名錄來自教育部統計處官方開放資料，但非營利／準公共的進一步分類、月費與裁罰紀錄旗標來自民間轉錄全國教保資訊網的 kiang/ap.ece.moe.edu.tw 專案（MIT 授權），並非教育部官方欄位。若該民間轉錄超過 60 天未更新，站上會自動停用這些補充欄位，僅顯示教育部公/私立二分類。",
      },
      {
        question: "資料來源與更新頻率？",
        answer: "基本名錄來自教育部統計處公開之全國幼兒園名錄開放資料；補充的分類、月費與裁罰紀錄來自民間轉錄，隨來源更新頻率同步。",
      },
    ],
  },
  {
    // issue #601 (parent #599 §兒少福利與社福求助): 托嬰中心與居家托育地圖，先
    // 用臺北、新北兩個縣市把骨架建好——新 facilityType（childcare_center 含
    // extra_json.category 公辦民營/社區公共托育家園/準公共/私立、以及
    // home_childcare_center）、匯入與驗證流程、臺北私立/準公共去重邏輯，供後續
    // 六都＋新竹縣市/彰化/嘉義市的縣市票套用同一套模式（見
    // lib/server/facilities/sources/taipeiChildcare.ts、ntpcChildcare.ts）。
    slug: "childcare-centers",
    group: "family",
    lastUpdated: "2026-10-14",

    schemaType: "WebPage",
    title: "托嬰中心與居家托育地圖（臺北／新北）",
    keywords: ["托嬰中心", "居家托育", "保母", "準公共托嬰中心", "公辦民營托嬰中心", "社區公共托育家園", "托育費用"],
    description:
      "查詢臺北市、新北市托嬰中心與居家托育服務中心（找保母的窗口），依公辦民營、社區公共托育家園、準公共、私立分類，顯示核定／實際收托人數與評鑑結果。資料來源：臺北市政府社會局、新北市政府社會局開放資料；其餘縣市請改用衛福部社家署全國系統性查詢。",
    directAnswer:
      "整合臺北、新北托嬰中心與居家托育服務中心名冊，依公辦民營、準公共、私立等分類查詢收托人數與評鑑結果。",
    scientificBasis: [
      {
        title: "臺北市托嬰中心（私立／公辦民營／準公共／社區公共托育家園）開放資料",
        authority: "臺北市政府社會局",
        url: "https://data.taipei",
      },
      {
        title: "新北市托嬰中心（私立／公共托育中心）與居家托育服務中心開放資料",
        authority: "新北市政府社會局",
        url: "https://data.ntpc.gov.tw",
      },
      {
        title: "托育管理資訊系統全國系統性查詢",
        authority: "衛生福利部社會及家庭署 (SFAA)",
        url: "https://ncwisweb.sfaa.gov.tw",
      },
    ],
    relatedSlugs: ["kindergartens", "child-welfare-institutions", "cram-schools"],
    faqs: [
      {
        question: "公辦民營、社區公共托育家園、準公共跟私立托嬰中心有什麼差別？",
        answer:
          "公辦民營、社區公共托育家園由政府出資、委託民間團體經營，收費較低；準公共托嬰中心是私立機構與地方政府簽約，家長可領準公共托育補助、收費也受政府規範；私立托嬰中心則完全自主訂價，未必有補助。",
      },
      {
        question: "居家托育服務中心是托嬰機構嗎？",
        answer:
          "不是。居家托育服務中心是協助家長找保母的媒合與管理窗口，負責保母登記、媒合、訪視輔導與托育諮詢，本身不收托幼兒；托嬰中心才是實際收托幼兒的機構。",
      },
      {
        question: "我家不在臺北或新北，可以查到資料嗎？",
        answer:
          "目前僅收錄臺北市、新北市，其餘縣市尚未建置。可改用頁面上連結的衛福部社家署「托育管理資訊系統全國系統性查詢」查詢其他縣市。",
      },
      {
        question: "為什麼有些托嬰中心只出現在準公共分類，沒有重複列在私立分類？",
        answer:
          "同一家私立托嬰中心申請「準公共」資格後，會同時出現在臺北市的私立名冊跟準公共名冊裡。本站比對機構名稱與地址後，重疊的機構只顯示一筆、歸類為準公共（並帶出準公共名冊的核定/實際收托人數與評鑑結果），避免同一地點重複出現。",
      },
    ],
  },
  {
    slug: "cram-schools",
    group: "family",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "全國短期補習班查詢",
    keywords: ["補習班查詢", "安親班"],
    description:
      "查詢全臺 22 縣市立案短期補習班名冊，涵蓋文理類、外語類、技藝類補習班地址、電話與立案狀態。資料來源：教育部短期補習班資訊管理系統。",
    directAnswer:
      "整合全臺 22 縣市短期補習班開放資料，提供合法立案補習班類科、地址與聯絡資訊地圖檢索。",
    scientificBasis: [
      {
        title: "全國短期補習班資訊管理系統開放資料",
        authority: "教育部 (MOE)",
        url: "https://bsb.kh.edu.tw",
      },
    ],
    relatedSlugs: ["kindergartens", "child-welfare-institutions", "child-safety-spots", "child-native-languages"],
    faqs: [
      {
        question: "短期補習班包含哪些類科？",
        answer:
          "涵蓋文理類（升學、課輔）、外語類（英語、日語等）、技藝類（音樂、美術、舞蹈、電腦、珠心算等）合法立案之短期補習班。",
      },
      {
        question: "如何確認補習班是否合法立案？",
        answer:
          "本站收錄教育部補習班資訊管理系統公開之合法立案名冊，可查驗立案日期與主管教育局處單位代碼。",
      },
    ],
  },
  {
    // issue #612: data.gov.tw 115950「全國開業護理機構清冊」拆出的產後護理之家
    // （月子中心）獨立工具；同一份資料集的一般護理之家、居家護理所併入既有
    // "long-term-care" 工具的 categories 篩選，不重複建一個工具條目。
    slug: "postpartum-care",
    group: "family",
    lastUpdated: "2026-10-14",

    title: "產後護理之家地圖",
    keywords: ["月子中心", "坐月子中心", "產後護理機構", "產後護理之家查詢"],
    description:
      "查詢全臺產後護理之家（月子中心）名冊，提供產後護理床與嬰兒床開放床數、評鑑結果與合格效期，協助確認機構資格是否仍在有效期內。資料來源：衛生福利部護理及健康照護司全國開業護理機構清冊。",
    directAnswer:
      "查詢全臺依《護理機構分類設置標準》開業之產後護理之家（俗稱月子中心），顯示產後護理床與嬰兒床開放床數、最近一次評鑑結果，以及評鑑合格效期是否仍在有效期內，方便入住前確認機構資格。",
    scientificBasis: [
      {
        title: "全國開業護理機構清冊（含一般護理之家、居家護理所及產後護理之家）",
        authority: "衛生福利部護理及健康照護司",
        url: "https://data.gov.tw/dataset/115950",
      },
    ],
    relatedSlugs: ["baby-friendly-hospitals", "breastfeeding-rooms", "long-term-care", "child-welfare-institutions"],
    schemaType: "MedicalWebPage",
    faqs: [
      {
        question: "產後護理之家（月子中心）跟一般護理之家、居家護理所是同一份名冊嗎？",
        answer:
          "是。衛福部護理及健康照護司「全國開業護理機構清冊」同時收錄這三種機構，本站依機構類別拆開呈現：產後護理之家獨立為本頁，一般護理之家與居家護理所併入「長照照顧圈地圖」工具的分類篩選。",
      },
      {
        question: "頁面上的「評鑑結果」與「合格效期」代表什麼？",
        answer:
          "評鑑結果是機構最近一次接受衛生主管機關評鑑的結果（合格／不合格／尚未評鑑），合格效期是評鑑合格後的有效期限；本站會依合格效期自動標示「效期內」或「已過期」，但入住前仍建議以機構現場公告或當地衛生局查詢結果為準。",
      },
      {
        question: "資料包含哪些欄位？多久更新？",
        answer:
          "包含機構名稱、縣市、電話、地址、產後護理床與護理類嬰兒床開放床數、評鑑結果、合格效期與 WGS84 經緯度（資料本身已內附座標，不需另行定位）。資料來源標示為每年更新一次，本站排程同步跟進。",
      },
    ],
  },
  {
    slug: "child-safety-spots",
    group: "disaster-alerts",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "婦幼安全警示地點查詢",
    keywords: ["婦幼安全", "治安顧慮地點", "警示地點"],
    description:
      "查詢內政部警政署公告之全國婦幼安全警示地點與加強維安路段，提供管轄警察分局及聯繫窗口資訊，提醒家長與婦幼留意環境安全。資料來源：內政部警政署開放資料。",
    directAnswer:
      "查詢警政署公告之婦幼安全警示地點，提供管轄警察局、分局、專人聯繫窗口與位置地圖。",
    scientificBasis: [
      {
        title: "婦幼安全警示地點開放資料集",
        authority: "內政部警政署 (NPA)",
        url: "https://data.gov.tw",
      },
    ],
    relatedSlugs: ["disaster-map", "weather-alerts", "kindergartens"],
    faqs: [
      {
        question: "什麼是婦幼安全警示地點？",
        answer:
          "指經各縣市警察局評估需加強巡邏維護治安或提醒民眾提高警覺之公共場所、暗巷、陸橋涵洞或易聚集路段。",
      },
      {
        question: "如果發現安全疑慮該如何反映？",
        answer:
          "各警示點均附有管轄警察局分局與專人聯繫電話，遇緊急狀況請立即撥打 110 報案。",
      },
    ],
  },
  {
    slug: "child-native-languages",
    group: "family",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    navLabel: "本土語言辭典",
    title: "兒少本土語言辭典（閩南語／客語）",
    keywords: ["台語辭典", "客語辭典", "本土語言", "閩南語字典"],
    description:
      "整合教育部《臺灣閩南語常用詞辭典》與《臺灣客家語常用詞辭典》，收錄數萬筆詞目、臺羅與客拼標音、六大客語腔調、生活例句與真人線上發音朗讀，支援華語意譯反查。",
    directAnswer:
      "整合教育部與 g0v 萌典開放資料，提供國中小學童與親子臺灣閩南語及客家語字詞、拼音、真人發音與生活例句查詢。",
    scientificBasis: [
      {
        title: "教育部臺灣閩南語常用詞辭典",
        authority: "教育部終身教育司 (MOE)",
        url: "https://twblg.dict.edu.tw",
      },
      {
        title: "教育部臺灣客家語常用詞辭典",
        authority: "教育部終身教育司 (MOE)",
        url: "https://hakkadict.moe.edu.tw",
      },
      {
        title: "g0v 萌典開放資料專案 (moedict-data-twblg, moedict-data-hakka)",
        authority: "g0v 零時政府",
        url: "https://www.moedict.tw",
      },
    ],
    relatedSlugs: ["cultural-events", "kindergartens", "cram-schools"],
    faqs: [
      {
        question: "兒少本土語言辭典收錄哪些語言與腔調？",
        answer:
          "收錄教育部臺灣閩南語常用詞辭典（優勢腔/臺羅拼音）與臺灣客家語常用詞辭典（涵蓋四縣、海陸、大埔、饒平、詔安、南四縣六大腔調）。",
      },
      {
        question: "如果不知道母語漢字，可以輸入華語（國語）查詢嗎？",
        answer:
          "可以。辭典支援多維度檢索，輸入日常華語意譯（例如「洗澡」、「彩虹」、「謝謝」）即可自動反查對應之閩南語與客語說法。",
      },
      {
        question: "詞條是否提供標準真人發音？",
        answer:
          "是。每個收錄詞條均附有真人發音播放功能，串接教育部與 g0v 萌典音檔 CDN，方便學童與家長跟讀學習。",
      },
    ],
  },
  {
    slug: "npo-organizations",
    group: "elder-care-welfare",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "全臺公益組織(NPO)查詢",
    keywords: ["公益組織", "NPO查詢", "非營利組織", "捐款立案"],
    description:
      "整合臺灣公益資訊中心（NPO Center）及財政部機關團體名冊，收錄全國社會福利慈善財團法人、兒少保護、身心障礙、老人照護、環境保護、性別平權與急難救助等公益組織。支援名稱、統一編號、縣市與機構屬性篩選，提供詳細地址地圖導航、官方網站連結與電話一鍵撥號。",
    directAnswer:
      "查詢全國非營利組織（NPO）、公益慈善財團法人、社會福利團體、統一編號、門牌地址、官方網站與聯絡電話。",
    scientificBasis: [
      {
        title: "臺灣公益資訊中心 (NPO Center) 組織名錄",
        authority: "財團法人喜瑪拉雅研究發展基金會",
        url: "https://www.npo.org.tw",
      },
      {
        title: "機關團體扣繳單位基本資料 (BGMOPEN99)",
        authority: "財政部財政資訊中心 (FIA)",
        url: "https://eip.fia.gov.tw",
      },
    ],
    relatedSlugs: ["food-operators", "green-certifications", "child-welfare-institutions", "disability-welfare", "sheltered-workshops"],
    faqs: [
      {
        question: "全臺公益組織(NPO)名錄包含哪些機構？",
        answer:
          "收錄臺灣公益資訊中心登記之社福、兒少、身障、長者照護、環境永續、國際倡議等非營利公益團體，以及財政部登記之機關團體扣繳單位。",
      },
      {
        question: "如何查驗非營利組織的官方網站與聯絡電話？",
        answer:
          "在搜尋結果卡片上，可直接點擊「官方網站/Facebook 粉專」外連按鈕，或透過電話與地圖導航按鈕直接聯繫前往。",
      },
    ],
  },
  {
    // issue #256: merged with the former "family-cultural-activities" tool
    // (全國親子藝文活動查詢, slug now 301-redirected here) — both drew on the
    // exact same 文化部 SearchShowAction dataset, the "family" page just
    // rendered it without the category tabs/pagination this page already had.
    // The merged page keeps every existing category tab and adds a "親子友善"
    // quick-filter (see CulturalEventsContent.tsx) so the family-oriented
    // subset is still one click away instead of living on a separate page.
    slug: "cultural-events",
    group: "life-culture",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "全國藝文展覽與親子活動查詢",
    keywords: ["藝文活動", "展覽資訊", "親子活動"],
    description:
      "整合文化部全國藝文活動開放資料，查詢全國展覽、音樂、戲劇、講座等各類活動，並提供「親子友善」篩選標籤快速鎖定親子劇場、兒童音樂會與親子工作坊。資料來源：文化部開放資料。",
    directAnswer:
      "即時連線文化部藝文活動資訊系統，查詢全國展演、音樂會與講座活動，並可切換「親子友善」篩選標籤只看親子劇場、兒童音樂會與工作坊節目。",
    scientificBasis: [
      {
        title: "文化部全國藝文活動資訊系統開放資料 (SearchShowAction)",
        authority: "文化部 (MOC)",
        url: "https://cloud.culture.tw",
      },
    ],
    relatedSlugs: ["public-art", "heritage-map", "latest-books", "tourism-factories"],
    faqs: [
      {
        question: "活動資訊包含哪些類別？",
        answer:
          "完整涵蓋文化部 19 類藝文活動（展覽、音樂、戲劇、舞蹈、親子、講座、電影、獨立音樂、綜藝、藝文競賽、演唱會、研習課程等）、全國節慶活動與文化生活圈場館。",
      },
      {
        question: "這個頁面是否包含原本「全國親子藝文活動查詢」的內容？",
        answer:
          "是。原「全國親子藝文活動查詢」頁面已併入本頁並 301 轉址於此，點擊「👨‍👩‍👧 親子友善」篩選標籤即可只看親子劇場、兒童音樂會與親子工作坊等節目，範圍與原頁面一致。",
      },
    ],
  },
  {
    slug: "public-art",
    group: "life-culture",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "全國公共藝術與演藝場所地圖",
    keywords: ["公共藝術", "演藝場所", "表演場館"],
    description:
      "查詢全臺設置之公共藝術作品、作者與設置地點，以及 767 處公私立演藝活動場所。資料來源：文化部公共藝術資料庫與演藝場所開放資料。",
    directAnswer:
      "即時探索全臺灣各縣市設置之公共藝術作品、地標裝置與 767 處公私立演藝活動場所資訊。",
    scientificBasis: [
      {
        title: "公共藝術官方資料庫 (artWork/openData)",
        authority: "文化部 (MOC)",
        url: "https://publicartap.moc.gov.tw",
      },
      {
        title: "全國公私立演藝活動場所 (SearchPerformPlaceAction)",
        authority: "文化部 (MOC)",
        url: "https://cloud.culture.tw",
      },
    ],
    relatedSlugs: ["cultural-events", "heritage-map"],
    faqs: [
      {
        question: "如何查找身邊的公共藝術作品與演藝場所？",
        answer:
          "開啟定位或輸入行政區關鍵字，即可列出周遭公共藝術地標以及演藝表演場所，並支援一鍵查詢登記方式與聯絡電話。",
      },
    ],
  },
  {
    slug: "heritage-map",
    group: "life-culture",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    navLabel: "文化資產地圖",
    title: "文化資產地圖：古蹟／歷史建築／考古遺址查詢",
    keywords: ["古蹟查詢", "歷史建築", "考古遺址", "文化資產"],
    description:
      "整合文化部文化資產局開放資料，於地圖上查詢全臺古蹟、歷史建築與考古遺址點位，支援圖層切換、沿革與登錄理由查詢。",
    directAnswer:
      "文化資產地圖整合文化部文化資產局開放資料，提供全臺古蹟／歷史建築（1,700+ 案）與考古遺址（50+ 案）點位地圖，可切換圖層查詢名稱、地址、沿革與登錄理由。",
    scientificBasis: [
      {
        title: "文化資產個案（建築類、考古遺址類）開放資料",
        authority: "文化部文化資產局 (BOCH)",
        url: "https://data.boch.gov.tw",
      },
    ],
    relatedSlugs: ["public-art", "cultural-events"],
    faqs: [
      {
        question: "文化資產地圖的資料多久更新一次？",
        answer:
          "本站不定期同步一次文化部文化資產局開放資料平臺之文化資產個案資料，頁面頂端會顯示最近一次同步時間。",
      },
      {
        question: "「古蹟／歷史建築」與「考古遺址」兩個圖層分別代表什麼？",
        answer:
          "古蹟／歷史建築圖層涵蓋依《文化資產保存法》指定或登錄之古蹟與歷史建築個案；考古遺址圖層涵蓋國定、直轄市定與縣（市）定考古遺址個案，兩者資料筆數與登錄理由皆來自文化資產局官方資料庫。",
      },
    ],
  },
  {
    slug: "travel-epidemic-alerts",
    group: "disaster-alerts",
    lastUpdated: "2026-10-13",

    title: "國際旅遊疫情與即時情報地圖",
    // "登革熱" added for issue #462's news↔tool cross-linking acceptance
    // criterion (登革熱 news should surface this tool): 疾管署同時監控境外
    // 移入與本土登革熱疫情，屬於這個國際疫情地圖涵蓋的疾病範圍之一。
    keywords: ["出國疫情", "旅遊警示", "境外感染", "登革熱"],
    description:
      "即時連線疾管署國際旅遊疫情建議等級與全球重要疫情快訊，提供各國警戒等級（注意/警示/警告）地圖視覺化、疾病快搜與最新流行病學情報。資料來源：衛生福利部疾病管制署。",
    directAnswer:
      "即時查詢疾管署全球旅遊疫情建議等級與各國爆發疾病通報，掌握最新出國防疫衛教與警示範圍。",
    scientificBasis: [
      {
        title: "國際間旅遊疫情建議等級資料集 (TCDCTravelAlert)",
        authority: "衛生福利部疾病管制署 (Taiwan CDC)",
        url: "https://www.cdc.gov.tw",
      },
      {
        title: "國際重要疫情資訊 (TCDCIntlEpidAll)",
        authority: "衛生福利部疾病管制署 (Taiwan CDC)",
        url: "https://www.cdc.gov.tw",
      },
    ],
    relatedSlugs: ["aqi", "uv", "weather-alerts", "global-watch"],
    faqs: [
      {
        question: "國際旅遊疫情建議等級如何劃分？",
        answer:
          "疾管署分為三級：第一級「注意 (Watch)」提醒遵守當地一般預防措施；第二級「警示 (Alert)」對當地採取加強防護；第三級「警告 (Warning)」避免至當地所有非必要旅遊。",
      },
      {
        question: "出國前該如何做好健康防護？",
        answer:
          "建議出國前 2 至 4 週至旅遊醫學門診諮詢疫苗接種或預防用藥，並於旅途中落實手部衛生、防蚊措施與飲食衛生。",
      },
    ],
  },
  {
    slug: "weather-alerts",
    group: "disaster-alerts",
    lastUpdated: "2026-10-12",

    title: "即時氣象警報與降雨資訊",
    keywords: ["氣象警報", "豪雨特報", "颱風警報", "降雨"],
    description:
      "即時查詢全臺氣象警報（強風、濃霧、豪大雨、颱風警報及鄉鎮劇烈天氣特報），並依 GPS 定位查詢最近測站即時與月累積降雨量。",
    directAnswer:
      "本站即時連線中央氣象署 (CWA) 5 大警報與測站資料庫，提供陸上強風、濃霧、豪大雨、颱風路徑警報及全臺雨量測站即時觀測。",
    scientificBasis: [
      {
        title: "氣象警報與豪大雨特報作業標準",
        authority: "交通部中央氣象署 (CWA)",
        url: "https://www.cwa.gov.tw",
      },
      {
        title: "災害防救應變作業指引與防汛須知",
        authority: "內政部消防署",
        url: "https://www.nfa.gov.tw",
      },
    ],
    referenceTable: {
      title: "中央氣象署降雨特報分級標準對照表",
      headers: ["警報分級", "24小時累積雨量", "3小時累積雨量", "代表燈號", "防災因應指引"],
      rows: [
        ["大雨 (Heavy Rain)", "≥ 80 mm", "或 ≥ 40 mm", "黃色 🟡", "低窪地區慎防積淹水，山區防落石"],
        ["豪雨 (Extremely Heavy Rain)", "≥ 200 mm", "或 ≥ 100 mm", "橘色 🟠", "防範淹水、土石流與溪水暴漲"],
        ["大豪雨 (Torrential Rain)", "≥ 350 mm", "或 ≥ 200 mm", "紅色 🔴", "高度危險，避免進入山區或溪流活動"],
        ["超大豪雨 (Extremely Torrential Rain)", "≥ 500 mm", "—", "紫色 🟣", "重大致災降雨，配合預警性撤離與避難"],
      ],
    },
    relatedSlugs: ["aqi", "uv", "earthquakes", "water", "travel-epidemic-alerts"],
    faqs: [
      {
        question: "氣象警報多久更新一次？",
        answer:
          "本站氣象警報資料每 5 至 10 分鐘自動同步中央氣象署最新發布之 CAP 警報、颱風消息及鄉鎮災害特報。",
      },
      {
        question: "如何查詢我所在位置的最近雨量站？",
        answer:
          "開啟瀏覽器 GPS 定位權限後，系統會自動比對全臺 1,300+ 座雨量站並計算最短距離，顯示該測站的 10 分鐘、1 小時與 24 小時累積雨量；亦可手動選擇縣市行政區查詢。",
      },
      {
        question: "豪雨與大雨的分級標準為何？",
        answer:
          "依氣象署標準：大雨為 24 小時累積 ≥80mm 或 3 小時 ≥40mm；豪雨為 24 小時 ≥200mm 或 3 小時 ≥100mm；大豪雨為 24 小時 ≥350mm 或 3 小時 ≥200mm；超大豪雨為 24 小時 ≥500mm。",
      },
    ],
  },
  {
    slug: "cool-spots",
    group: "life-culture",
    lastUpdated: "2026-10-12",

    title: "全國涼適點查詢",
    keywords: ["涼適點", "避暑", "降溫站"],
    description:
      "查詢環境部「Cool Map 涼適點」名冊，提供百貨、圖書館、里民活動中心等可供民眾避暑消暑之場所位置與設施資訊。資料來源：環境部開放資料。",
    directAnswer:
      "查詢環境部「Cool Map」涼適點名冊，提供夏季高溫時可就近避暑消暑之室內場所位置、開放時間與冷氣、飲水機等設施資訊。",
    scientificBasis: [
      {
        title: "Cool Map 涼適點點位開放資料",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
    ],
    relatedSlugs: ["uv", "public-toilets", "green-certifications", "iaq-premises"],
    faqs: [
      {
        question: "什麼是「涼適點」？",
        answer:
          "涼適點是環境部因應高溫熱浪，盤點百貨公司、圖書館、里民活動中心等有冷氣、座位或飲水設施之室內場所，供民眾於酷暑時就近入內消暑休息的據點。",
      },
      {
        question: "如何知道涼適點有沒有冷氣或無障礙設施？",
        answer:
          "每筆資料的「設施資訊」會列出該點位是否提供冷氣、廁所、座位、飲水機與無障礙設施等，可依需求挑選合適的地點。",
      },
    ],
  },
  {
    slug: "iaq-premises",
    group: "environment-food",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "室內空氣品質法公告場所查詢",
    keywords: ["室內空氣品質", "公告場所", "IAQ"],
    description:
      "查詢應符合《室內空氣品質管理法》之公告場所名冊，如捷運站、圖書館、大型賣場等。資料來源：環境部開放資料。",
    directAnswer:
      "查詢環境部依《室內空氣品質管理法》公告應定期監測與管理室內空氣品質之場所名冊，涵蓋捷運站、圖書館、大型賣場等公共場所。",
    scientificBasis: [
      {
        title: "應符合室內空氣品質管理法之公告場所開放資料",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
    ],
    relatedSlugs: ["aqi", "cool-spots"],
    faqs: [
      {
        question: "哪些場所需要符合室內空氣品質管理法？",
        answer:
          "經環境部公告之特定場所，如大眾運輸轉運站、圖書館、大型商場等，須依法定期實施室內空氣品質檢測與管理措施。",
      },
    ],
  },
  {
    slug: "cleaning-squads",
    group: "environment-food",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "地方清潔隊聯絡資訊查詢",
    keywords: ["清潔隊", "垃圾車", "清潔隊電話"],
    description:
      "查詢全國各縣市地方清潔隊聯絡地址與電話，供民眾洽詢垃圾清運、資源回收等相關業務。資料來源：環境部開放資料。",
    directAnswer:
      "查詢全國各縣市地方環保局所屬清潔隊之聯絡地址與電話，供垃圾清運、資源回收、大型廢棄物申報等業務洽詢。",
    scientificBasis: [
      {
        title: "地方清潔隊聯絡資訊開放資料",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
    ],
    relatedSlugs: ["green-certifications", "public-toilets"],
    faqs: [
      {
        question: "清潔隊可以協助處理哪些業務？",
        answer:
          "地方清潔隊主要負責轄區垃圾清運、資源回收、大型廢棄物清運申報等業務，實際受理項目與收費依各縣市規定為準。",
      },
    ],
  },
  {
    // issue #256: merged "carbon-footprint-products" (產品碳足跡標籤查詢) and
    // "carbon-footprint-coefficients" (碳足跡排放係數查詢) into one page with
    // a 產品標籤／排放係數 tab, reusing both existing bespoke content
    // components unmodified — see CarbonFootprintContent.tsx.
    slug: "carbon-footprint",
    group: "environment-food",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    navLabel: "碳足跡查詢",
    title: "碳足跡查詢：產品標籤與排放係數",
    keywords: ["碳足跡", "碳標籤", "排放係數"],
    description:
      "查詢環境部審查通過之產品碳足跡標籤數據，以及原物料、製程、能源等單位活動量之碳足跡排放係數，可切換分頁查看。資料來源：環境部開放資料（cfp_p_01、cfp_p_02）。",
    directAnswer:
      "碳足跡查詢整合環境部審查通過之產品碳足跡標籤（含宣告單位與證書效期）與碳足跡排放係數資料庫（原物料、製程、能源等單位活動量對應排放量），可切換分頁查看。",
    scientificBasis: [
      {
        title: "產品碳足跡資訊開放資料 (cfp_p_01)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
      {
        title: "碳足跡排放係數資料庫 (cfp_p_02)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
    ],
    relatedSlugs: ["green-certifications", "water-conditions"],
    faqs: [
      {
        question: "什麼是產品碳足跡標籤？",
        answer:
          "碳足跡標籤是產品從原料取得、製造、配送銷售、使用到廢棄回收之生命週期溫室氣體排放量，經環境部審查認證後核發的標示，協助消費者辨識低碳產品。「產品標籤查詢」分頁可查詢通過審查且證書仍在有效期限內之產品碳足跡數據。",
      },
      {
        question: "什麼是碳足跡排放係數？",
        answer:
          "排放係數是計算特定活動（如生產一公斤原物料、消耗一度電）所產生溫室氣體排放量的換算基準，是計算產品碳足跡時不可或缺的參考數據，由環境部審定並公告。「排放係數對照表」分頁可查詢完整係數資料庫。",
      },
      {
        question: "碳足跡數據的單位是什麼？",
        answer:
          "每項產品的碳足跡數據會搭配「宣告單位」一併顯示（如每公斤、每件），代表該碳排放數值所對應的計算基準，不同產品間的宣告單位可能不同，比較時請留意單位是否一致。",
      },
      {
        question: "為什麼有些係數沒有標示公告部門？",
        answer:
          "公司/部門名稱欄位由各申報單位選擇性揭露，環境部開放資料原始欄位本身即可能為空值，此為資料來源限制，並非查詢功能異常。",
      },
    ],
  },
  {
    slug: "aqx-monitoring",
    group: "environment-food",
    lastUpdated: "2026-10-12",

    title: "空氣品質延伸監測資料查詢（AQX 系列）",
    keywords: ["AQX", "延伸空品監測", "空品歷史資料"],
    description:
      "查詢環境部開放資料平臺 AQX 系列監測小時值，涵蓋一般污染物、BTEX、非甲烷碳氫化合物（NMHC）、總碳氫化合物（THC）、光化測站、CO 8小時平均值、PM10 小時值與其它測項。",
    directAnswer:
      "查詢環境部 AQX 系列延伸空氣品質監測資料，包含一般污染物、BTEX、NMHC、THC、光化測站小時值，以及 CO 8小時平均值、PM10 小時值、其它測項等單筆讀值資料，每筆結果均標示測項名稱、單位與更新頻率。",
    scientificBasis: [
      {
        title: "空氣品質監測小時值(一般污染物) (aqx_p_15)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
      {
        title: "BTEX監測小時值 (aqx_p_16)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
      {
        title: "非甲烷碳氫化合物(NMHC)監測小時值 (aqx_p_17)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
      {
        title: "總碳氫化合物(THC)監測小時值 (aqx_p_18)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
      {
        title: "光化測站小時值資料 (aqx_p_25)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
      {
        title: "CO_8hr平均值 (aqx_p_318)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
      {
        title: "PM10小時值 (aqx_p_319)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
      {
        title: "空氣品質監測小時值資料(其它測項) (aqx_p_35)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
    ],
    relatedSlugs: ["aqi"],
    faqs: [
      {
        question: "AQX 系列資料和 AQI 空氣品質指標有什麼不同？",
        answer:
          "AQI 是綜合多項污染物換算而成的單一指標；AQX 系列則是原始測站監測小時值，涵蓋一般污染物、BTEX、NMHC、THC、光化測站、CO 8小時平均值、PM10 小時值與其它測項，適合需要查看個別測項原始數值的進階需求。",
      },
      {
        question: "每個資料集的更新頻率一樣嗎？",
        answer:
          "不一樣。部分資料集為每日更新一次（如一般污染物、BTEX、NMHC、THC、光化測站小時值），部分為每小時更新（如 PM10 小時值、其它測項），CO 8小時平均值則每日提供 17 筆，頁面上會於資料集選單旁標示各資料集的更新頻率。",
      },
    ],
  },
  {
    // issue #256: merged "water-level-stations" (全臺水位站即時水位查詢) and
    // "reservoir-status" (全臺水庫即時營運狀況查詢) into one 全臺水情 page
    // with a river/reservoir tab, reusing both existing bespoke content
    // components unmodified — see WaterConditionsContent.tsx.
    slug: "water-conditions",
    group: "disaster-alerts",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    navLabel: "全臺水情查詢",
    title: "全臺水情：河川水位與水庫營運查詢",
    keywords: ["水情", "河川水位", "水庫蓄水率"],
    description:
      "即時查詢經濟部水利署全臺河川／地下水位站與水庫營運狀況，可切換分頁查看測站即時水位或水庫蓄水量、進出流量與集水區降雨量。資料來源：經濟部水利署開放資料平臺。",
    directAnswer:
      "全臺水情查詢整合經濟部水利署約 370 個河川／地下水位站即時水位，以及全臺 61 座水庫的蓄水量、進出流量與集水區降雨量，可切換分頁查看，資料每 30 分鐘自動更新。",
    scientificBasis: [
      {
        title: "水位站監測資料",
        authority: "經濟部水利署 (WRA)",
        url: "https://opendata.wra.gov.tw",
      },
      {
        title: "水庫即時營運狀況資料",
        authority: "經濟部水利署 (WRA)",
        url: "https://opendata.wra.gov.tw",
      },
    ],
    relatedSlugs: ["weather-alerts", "earthquakes", "aqi"],
    faqs: [
      {
        question: "這份水位資料涵蓋哪些測站？",
        answer:
          "「河川水位」分頁涵蓋經濟部水利署全臺河川與地下水位監測站，不限水庫集水區，測站以代碼（如 1010H006）標示，資料來源未提供測站中文名稱。",
      },
      {
        question: "這份資料涵蓋哪些水庫？",
        answer:
          "「水庫營運」分頁涵蓋經濟部水利署列管之全臺主要水庫，以水庫代碼（如 50303）標示；水庫代碼前兩碼代表區域（10北部、20中部、30南部、40東部、50離島）。",
      },
      {
        question: "「有效蓄水量」與「進出流量」的單位是什麼？",
        answer:
          "有效蓄水量單位為萬立方公尺，進流量、出流量（含溢洪道、發電放水、排砂隧道等各類出流）單位為 CMS（每秒立方公尺），欄位無資料時顯示「—」。",
      },
      {
        question: "資料多久更新一次？",
        answer:
          "本站每 30 分鐘自動同步一次經濟部水利署開放資料平臺的最新監測與營運結果；來源資料本身以逐時或每 10 分鐘為主要更新頻率，實際以各測站/水庫狀況為準。",
      },
      {
        question: "這個頁面是否包含原本「全臺水位站即時水位查詢」與「全臺水庫即時營運狀況查詢」的內容？",
        answer:
          "是。這兩個原本獨立的工具已合併為本頁，原網址皆已 301 轉址於此，切換上方「河川水位」／「水庫營運」分頁即可分別查看，資料範圍與更新來源維持不變。",
      },
    ],
  },
  {
    slug: "disaster-map",
    group: "disaster-alerts",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    navLabel: "防災地圖",
    title: "防災地圖：避難收容處所／消防救援單位／應變中心查詢",
    keywords: ["避難收容所", "防災地圖", "消防救援", "緊急避難場所"],
    description:
      "整合內政部開放資料，於地圖上查詢全臺避難收容處所、消防救援單位與縣市應變中心點位，支援圖層切換與地點詳細資訊查詢。",
    directAnswer:
      "防災地圖整合內政部開放資料平臺之避難收容處所（5,900+ 處）、消防救援單位（770+ 處）與縣市應變中心（25 處）點位，提供地圖圖層切換查詢；本頁資料非即時，實際開設狀態請以地方政府正式公告為準。",
    scientificBasis: [
      {
        title: "避難收容處所點位檔案",
        authority: "內政部 (MOI) 開放資料平臺",
        url: "https://data.gov.tw",
      },
      {
        title: "消防救援單位點位、應變中心點位",
        authority: "內政部消防署 (NFA)",
        url: "https://www.nfa.gov.tw",
      },
    ],
    relatedSlugs: ["earthquakes", "weather-alerts", "emergency-supplies"],
    faqs: [
      {
        question: "防災地圖的資料多久更新一次？",
        answer:
          "本站每日定期同步一次內政部開放資料平臺之避難收容處所、消防救援單位與應變中心點位資料，頁面頂端會顯示最近一次同步時間。",
      },
      {
        question: "地震或颱風來臨時，避難收容所是否都已開設？",
        answer:
          "不一定。本頁資料為平時可用之避難收容處所名冊，非即時開設狀態；實際避難收容所是否開設、開放時間與收容狀況，請以地方政府（消防局／區公所）正式公告為準，切勿逕自依本頁資訊前往。",
      },
      {
        question: "三個圖層（避難收容處所／消防救援單位／應變中心）分別代表什麼？",
        answer:
          "避難收容處所是災害發生時民眾可前往避難的場所；消防救援單位是消防隊點位，供查詢鄰近消防單位位置；應變中心是各縣市政府災害應變中心，通常與消防局同位置，負責統籌指揮救災。",
      },
    ],
  },
  {
    // Issue #587 (parent #583): first ticket of the "全球動態地球／Global
    // Watch" feature — ships only the MapLibre globe shell (vector/satellite
    // toggle, reset-to-Taiwan, reduced-motion, WebGL fallback). No data
    // layers yet (地震/颱風/全球災害/國際疫情/全球空品 are #588-#592+),
    // so this entry stays deliberately thin — not in INDEXABLE_SLUGS yet
    // (see that set's own doc comment on thin-shell pages), no FAQs beyond
    // the shell's own real, shipped behavior. Will absorb `earthquakes` and
    // `travel-epidemic-alerts` (see those entries' relatedSlugs) once their
    // own item tickets land — do not pre-emptively remove those two entries
    // here; #583's own ticket for that 301/catalog cleanup is separate.
    slug: "global-watch",
    group: "disaster-alerts",
    lastUpdated: "2026-10-14",

    schemaType: "WebPage",
    title: "全球動態地球",
    keywords: ["全球動態地球", "3D地球", "地球儀", "MapLibre", "全球地圖", "衛星影像"],
    description:
      "可拖曳旋轉、縮放的 3D 地球，拉近至城市層級自然轉為平面街道地圖；支援向量地圖與衛星影像切換，並可一鍵回到台灣預設視角。",
    directAnswer:
      "全球動態地球是一顆可拖曳旋轉、縮放的互動式 3D 地球（MapLibre GL JS globe 投影），拉近到街道層級會自然轉為平面地圖，提供向量地圖／衛星影像切換與「回到台灣」重置視角按鈕。",
    scientificBasis: [
      {
        title: "OpenFreeMap 開放向量地圖資料",
        authority: "OpenFreeMap（OpenMapTiles／OpenStreetMap 貢獻者）",
        url: "https://www.openfreemap.org/",
      },
      {
        title: "GIBS (Global Imagery Browse Services) — Blue Marble 公有領域影像",
        authority: "NASA EOSDIS",
        url: "https://www.earthdata.nasa.gov/data/tools/gibs",
      },
    ],
    relatedSlugs: ["earthquakes", "travel-epidemic-alerts", "disaster-map", "weather-alerts"],
    faqs: [
      {
        question: "全球動態地球目前提供哪些功能？",
        answer:
          "目前版本提供地球本身的瀏覽功能：可拖曳旋轉與縮放，拉近到城市層級會自然轉為平面街道地圖；可切換向量地圖與衛星影像兩種底圖；有一顆按鈕可隨時回到台灣為中心、可見西太平洋範圍的預設視角。地震、颱風、全球災害、國際疫情與全球空品等資料圖層將於後續版本陸續上線。",
      },
      {
        question: "裝置不支援 WebGL 時會發生什麼事？",
        answer:
          "偵測不到 WebGL 時，本頁不會嘗試載入互動式地球，只會顯示一段文字說明，不會出現錯誤或空白畫面。",
      },
    ],
  },
  {
    slug: "bookstores",
    group: "life-culture",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "全國實體書店查詢",
    keywords: ["實體書店", "獨立書店", "書店地圖"],
    description:
      "查詢全國特色實體書店、獨立書局與閱讀空間。資料來源：文化部開放資料。",
    directAnswer:
      "全國實體書店查詢收錄文化部特色書店開放資料，提供全臺獨立書店與實體書局的營業時間、地址、聯絡電話、交通方式與地圖定位導航。",
    scientificBasis: [
      {
        title: "實體書店開放資料 (typeId=M)",
        authority: "文化部文化資料開放服務網",
        url: "https://cloud.culture.tw",
      },
    ],
    relatedSlugs: ["cultural-events", "public-art", "cool-spots", "tourism-factories"],
    faqs: [
      {
        question: "本頁收錄哪些實體書店？",
        answer:
          "本頁收錄文化部「文化資料開放服務網」登記之全國實體書店名冊，涵蓋特色獨立書店、文學書房與社區閱讀空間。",
      },
      {
        question: "如何查詢身邊最近的書店？",
        answer:
          "頁面會自動依您的 GPS 定位，由近到遠列出附近的書店並標示直線距離；您亦可於上方搜尋列輸入書店名稱或縣市關鍵字快速尋找。",
      },
      {
        question: "書店營業時間是否即時準確？",
        answer:
          "營業時間為文化部資料集建檔資訊，特殊節慶、店休日或臨時營業時間異動，建議前往前先致電門市確認。",
      },
    ],
  },
  {
    slug: "tourism-factories",
    group: "life-culture",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "全臺認證觀光工廠查詢",
    keywords: ["觀光工廠", "工廠旅遊"],
    description:
      "查詢經濟部產業發展署評鑑通過之全臺觀光工廠與產業文化館。資料來源：經濟部產業發展署開放資料。",
    directAnswer:
      "收錄全臺通過經濟部產業發展署認證之優良觀光工廠名錄，提供北部、中部、南部、東部地區分類、預約參觀電話、廠址與官方網站連結。",
    scientificBasis: [
      {
        title: "觀光工廠名冊開放資料 (SDD6848)",
        authority: "經濟部產業發展署 (IDA)",
        url: "https://www.ida.gov.tw",
      },
    ],
    relatedSlugs: ["green-certifications", "cool-spots", "bookstores"],
    faqs: [
      {
        question: "什麼是經濟部認證觀光工廠？",
        answer:
          "通過經濟部產業發展署「觀光工廠輔導評鑑」之傳統製造工廠，具備產業文化展示、製程參觀與 DIY 體驗教學等寓教於樂服務。",
      },
      {
        question: "參觀觀光工廠需要提前預約嗎？",
        answer:
          "部分觀光工廠開放自由參觀，部分需配合導覽梯次或提前電話預約，建議出發前點擊卡片上的電話先致電確認。",
      },
    ],
  },
  {
    slug: "pet-adoption",
    group: "family",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "全臺毛孩認領養查詢",
    keywords: ["動物認養", "毛小孩認養", "公立動物之家"],
    description:
      "即時查詢全臺公立動物收容所等待認養之犬貓與各類毛小孩。資料來源：農業部動物保護資訊網開放資料。",
    directAnswer:
      "整合農業部動物保護資訊網全臺公立動物收容所資料，提供品種、性別、體型、毛色、絕育與狂犬病疫苗狀態篩選，附帶毛孩照片與收容所一鍵撥號諮詢。",
    scientificBasis: [
      {
        title: "公立動物收容所認領養開放資料 (85903)",
        authority: "農業部動物保護資訊網",
        url: "https://data.moa.gov.tw",
      },
    ],
    relatedSlugs: ["vet-clinics", "cool-spots", "bookstores"],
    faqs: [
      {
        question: "本頁收錄哪些動物認養資訊？",
        answer:
          "本頁同步農業部官方全國公立動物收容所之在所動物名錄，涵蓋狗、貓及其他等待有緣家庭認養之毛小孩。",
      },
      {
        question: "認養公立收容所的動物需要費用嗎？",
        answer:
          "政府公立收容所認養多數免收認養規費，並提供免費晶片植入、寵物登記與基礎狂犬病疫苗或絕育補助，各縣市具體規範請向各收容所洽詢。",
      },
      {
        question: "如何辦理認養手續？",
        answer:
          "認養人須年滿 18 歲，請攜帶身分證件親自前往收容所互動評估並辦理認養手續；出發前可先撥打卡片上的收容所電話確認動物當前在所狀況。",
      },
    ],
  },
  {
    slug: "breastfeeding-rooms",
    title: "全國哺集乳室地圖查詢",
    keywords: ["哺乳室", "集乳室", "親子廁所"],
    description:
      "整合衛生福利部國民健康署官方開放資料，查詢全臺依法設置與自願設置之公共哺集乳室位置、地址、電話與開放時段。",
    directAnswer:
      "全國哺集乳室地圖整合國健署孕產兒關懷網站資料，提供全臺 3,800+ 處依法設置與自願設置哺集乳室，支援 22 縣市快選、GPS 距離排序與機構電話查詢。",
    group: "family",
    lastUpdated: "2026-10-12",

    scientificBasis: [
      {
        title: "公共場所母乳哺育條例",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw",
      },
      {
        title: "孕產兒關懷網站－哺集乳室名冊",
        authority: "國民健康署孕產兒關懷中心",
        url: "https://mammy.hpa.gov.tw",
      },
    ],
    relatedSlugs: ["child-welfare-institutions", "contraception-map", "cool-spots"],
    faqs: [
      {
        question: "哪些場所依法必須設置哺集乳室？",
        answer:
          "依《公共場所母乳哺育條例》第 5 條，政府機關、鐵路車站、航空站、捷運交會轉乘站、一定規模以上之百貨公司及零售式量販店等公共場所，均強制設置哺集乳室並具備基本哺育設施。",
      },
      {
        question: "依法設置與自願設置哺集乳室有何不同？",
        answer:
          "「依法設置」為法條明訂強制設置之場所，具備標準規格與標示；「自願設置」為民間企業、一般營業場所或民間組織為友善育兒自主設立之哺育空間，提供育兒家長更多便利。",
      },
      {
        question: "哺集乳室內通常提供哪些基本配備？",
        answer:
          "法定哺集乳室通常具備洗手臺、冷熱飲水設備、沙發或哺育椅、電源插座（供電動吸乳器使用）、尿布臺及緊急求救鈴等安全與衛生設備。",
      },
    ],
  },
  {
    slug: "contraception-map",
    navLabel: "避孕諮詢地圖",
    title: "避孕諮詢地圖：婦產科診所與諮詢藥局查詢",
    keywords: ["避孕諮詢", "婦產科診所", "事後避孕藥"],
    description:
      "整合臺灣婦產科醫學會 BeOK 避孕諮詢室認證機構名冊，提供全臺 88 家婦產科診所與 798 家諮詢藥局之雙圖層點位查詢與雙重避孕衛教指引。",
    directAnswer:
      "避孕諮詢地圖整合臺灣婦產科醫學會認證名冊，收錄全臺近 900 處專業婦產科診所與健保諮詢藥局，提供事前/事後口服避孕藥諮詢與雙重避孕指導。",
    group: "family",
    lastUpdated: "2026-10-12",

    scientificBasis: [
      {
        title: "雙重避孕指引與衛教規範",
        authority: "臺灣婦產科醫學會",
        url: "https://www.beok.org.tw",
      },
    ],
    relatedSlugs: ["clinics", "pharmacies", "breastfeeding-rooms"],
    faqs: [
      {
        question: "什麼是「雙重避孕法」？",
        answer:
          "雙重避孕法是指女生常態使用口服事前避孕藥或子宮內避孕器，男生全程且正確使用保險套。能同時達到 99% 以上高避孕成功率並有效預防性傳染病（STDs）。",
      },
      {
        question: "避孕諮詢藥局與一般藥局有何差異？",
        answer:
          "本頁收錄之藥局均參與臺灣婦產科醫學會衛教計畫，藥師受過常規與緊急避孕衛教專業培訓，能提供去污名化、保密的避孕指導並協助評估是否需轉介婦產科醫師。",
      },
      {
        question: "事後避孕藥可以當作常態避孕方式嗎？",
        answer:
          "不建議。事後避孕藥含有高劑量荷爾蒙，僅供非預期緊急無防護性行為後 72 小時內補救使用，常規性生活應諮詢專科醫師採用事前口服避孕藥或其他常態安全措施。",
      },
    ],
  },
  {
    slug: "latest-books",
    navLabel: "書籍推薦",
    title: "書籍推薦：博客來、誠品與TAAZE讀冊選書",
    keywords: ["新書推薦", "選書", "博客來誠品讀冊"],
    description:
      "整合博客來 4 大暢銷榜、誠品線上 27 類主題選書與 TAAZE 讀冊生活 10 大注目與編輯推薦書單，涵蓋醫療保健、心理勵志、飲食料理、親子教養、熟齡長照與生活風格，即時掌握優質書單、定價優惠與讀者口碑好書。",
    directAnswer:
      "書籍推薦服務整合臺灣三大圖書通路，收錄博客來暢銷榜、誠品選書與 TAAZE 讀冊生活多元選書，涵蓋健康醫學、心理成長、生活風格與親子教養等多元好書，提供即時分類檢索與購書導覽。",
    group: "life-culture",
    lastUpdated: "2026-10-12",

    scientificBasis: [
      {
        title: "圖書分類法與出版書目規範",
        authority: "國家圖書館",
        url: "https://www.ncl.edu.tw",
      },
      {
        title: "臺灣圖書出版產業調查報告",
        authority: "文化部人文及出版司",
        url: "https://www.moc.gov.tw",
      },
    ],
    relatedSlugs: ["bookstores", "cultural-events", "public-art"],
    faqs: [
      {
        question: "「書籍推薦」收錄哪些通路與主題分類？",
        answer:
          "整合博客來 4 大榜單（心理勵志、醫療保健、飲食料理、親子教養）、誠品線上 27 大選書類別（醫學總論、中醫、養生長照、疾病預防、寵物照護等）與 TAAZE 讀冊生活 10 大注目新書及編輯推薦頻道（醫學保健、生活風格、少兒親子、教育學習、心理勵志），滿足多元閱讀需求。",
      },
      {
        question: "如何快速找到感興趣的特定好書？",
        answer:
          "可使用頂部通路標籤快速切換博客來、誠品或 TAAZE 讀冊生活，再點選分類晶片過濾；亦可在搜尋框直接輸入書名關鍵字、作者姓名或出版社名稱進行全文即時檢索。",
      },
      {
        question: "本站有提供線上購書或寄送服務嗎？",
        answer:
          "本站為非營利便民資訊整理工具，不直接從事圖書販售；點擊書籍卡片之「前往通路查看」或「購書連結」將直接安全前往博客來或誠品線上官方專頁完成選購。",
      },
    ],
  },
  {
    slug: "vet-clinics",
    group: "family",
    lastUpdated: "2026-10-12",

    title: "全臺動物醫院與獸醫診所查詢",
    keywords: ["動物醫院", "獸醫診所"],
    description:
      "查詢全臺各縣市開業之合法獸醫診療機構與動物醫院，支援附近定位與關鍵字搜尋。資料來源：農業部動植物防疫檢疫署。",
    directAnswer:
      "全臺動物醫院與獸醫診所查詢收錄農業部登記之合法獸醫診療機構，提供執業獸醫師、電話、地址與即時附近定位功能。",
    scientificBasis: [
      {
        title: "獸醫診療機構登記名冊",
        authority: "農業部動植物防疫檢疫署",
        url: "https://www.aphia.gov.tw",
      },
    ],
    relatedSlugs: ["pet-adoption", "clinics"],
    faqs: [
      {
        question: "如何查詢附近的動物醫院？",
        answer:
          "允許瀏覽器定位授權後，系統將自動列出周邊最近的動物醫院與獸醫診所，亦可依縣市或名稱關鍵字搜尋。",
      },
      {
        question: "資料涵蓋哪些機構類型？",
        answer:
          "收錄農業部動植物防檢署登錄之開業動物醫院、獸醫診所，並註記執照字號與負責獸醫師/獸醫佐。",
      },
    ],
  },
  {
    slug: "metro-alerts",
    group: "life-culture",
    lastUpdated: "2026-10-13",

    title: "全台軌道營運通阻",
    keywords: ["捷運公告", "電梯檢修", "捷運停駛", "臺鐵誤點", "高鐵停駛", "軌道通阻"],
    description:
      "即時彙整全台 6 個捷運／輕軌系統（臺北捷運、貓空纜車、桃園捷運、臺中捷運、高雄捷運、高雄輕軌）、臺鐵與高鐵的營運通阻公告，以及臺北捷運各車站無障礙電梯檢修公告。資料來源：交通部 TDX 運輸資料流通服務、臺北大眾捷運公司。",
    directAnswer:
      "全台軌道營運通阻即時彙整全台 6 個捷運／輕軌系統、臺鐵與高鐵的營運異常、停駛與電梯檢修公告，任一系統資料暫時無法取得也不影響其他系統正常顯示。",
    scientificBasis: [
      {
        title: "交通部 TDX 運輸資料流通服務：軌道即時資訊",
        authority: "交通部運輸資料流通服務平臺",
        url: "https://tdx.transportdata.tw",
      },
      {
        title: "臺北捷運營運資訊與無障礙設施管理",
        authority: "臺北大眾捷運股份有限公司",
        url: "https://www.metro.taipei",
      },
    ],
    relatedSlugs: ["youbike", "disability-atm", "accessible-transit"],
    faqs: [
      {
        question: "這個工具涵蓋哪些軌道系統？",
        answer:
          "涵蓋全台 6 個捷運／輕軌系統（臺北捷運、貓空纜車、桃園捷運、臺中捷運、高雄捷運、高雄輕軌）、臺鐵與高鐵，共 8 個來源的即時營運通阻公告。",
      },
      {
        question: "公告資訊多久更新一次？",
        answer:
          "系統每 30 分鐘自動同步交通部 TDX 與臺北大眾捷運公司發布之最新營運通阻與電梯檢修排程，提供最新即時資訊。",
      },
      {
        question: "如果某個系統暫時查不到資料，其他系統會受影響嗎？",
        answer:
          "不會。每個系統的資料都是獨立抓取，任一系統（例如某次高鐵資料逾時）暫時失敗，只會讓那個系統當次顯示為「暫無資料」，其餘系統仍會正常顯示最新公告。",
      },
      {
        question: "電梯檢修期間如何轉乘？",
        answer:
          "臺北捷運的電梯檢修公告均提供輪椅或行動不便旅客之替代出入口建議或替代車站指引。",
      },
    ],
  },
  {
    slug: "youbike",
    group: "life-culture",
    lastUpdated: "2026-10-12",

    title: "公共自行車 (YouBike 2.0) 即時動態",
    keywords: ["YouBike", "公共自行車", "共享單車"],
    description:
      "即時查詢全台 15 縣市 YouBike 2.0 與 2.0E 租借站點、可借車輛與空位數量。",
    directAnswer:
      "公共自行車即時動態整合全台 15 縣市的 YouBike 2.0 站點，提供即時可借車輛數、可還空位數、電輔車數量與附近站點導航。",
    scientificBasis: [
      {
        title: "公共自行車租賃系統即時開放資料",
        authority: "交通部及各直轄市政府交通局",
        url: "https://www.youbike.com.tw",
      },
    ],
    relatedSlugs: ["metro-alerts", "aqi", "cpc-prices"],
    faqs: [
      {
        question: "支援哪些縣市的 YouBike 查詢？",
        answer:
          "目前整合臺北市、新北市、桃園市、新竹市、新竹縣、苗栗縣、臺中市、彰化縣、雲林縣、嘉義市、嘉義縣、臺南市、高雄市、屏東縣與臺東縣共 15 個縣市之 YouBike 2.0 租借站點與即時可借車數、空位數。",
      },
      {
        question: "如何查找最近的租借站？",
        answer:
          "開啟定位授權後，系統將依直線距離由近至遠排列站點，並標示可借車輛數（綠色為車輛充足）。",
      },
    ],
  },
  {
    slug: "pest-alerts",
    group: "disaster-alerts",
    lastUpdated: "2026-10-13",

    title: "農作物病蟲害即時預警",
    // "登革熱"/"病媒蚊" added for issue #462's news↔tool cross-linking
    // acceptance criterion (登革熱 news should surface this tool alongside
    // travel-epidemic-alerts): 地方病媒蚊孳生源清除與通報作業在許多縣市由
    // 農業/環保稽查單位與病蟲害防治體系共同執行，是登革熱新聞讀者可能需要
    // 的鄰近示警資訊。
    keywords: ["病蟲害預警", "農作物病害", "登革熱", "病媒蚊"],
    description:
      "即時查詢農業部動植物防檢署發布之全臺農作物病蟲害即時示警與發生預警資訊。",
    directAnswer:
      "農作物病蟲害即時預警提供臺灣主要農作物害蟲與疫病即時預警燈號、受影響作物與防治建議，守護農業生產與綠色植栽。",
    scientificBasis: [
      {
        title: "作物病蟲害預警監控體系",
        authority: "農業部動植物防疫檢疫署",
        url: "https://www.aphia.gov.tw",
      },
    ],
    relatedSlugs: ["weather-alerts", "uv", "pesticide-sales"],
    faqs: [
      {
        question: "病蟲害預警資訊包含哪些內容？",
        answer:
          "收錄防檢署即時示警之害蟲名稱、警戒等級、好發作物與最新通報時間與防治注意事項。",
      },
      {
        question: "資料來源為何？",
        answer:
          "資料直接源自農業部動植物防疫檢疫署植物疫情監控開放資料平臺。",
      },
    ],
  },
  {
    slug: "power-grid-overview",
    group: "life-culture",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "全臺電力概況儀表板",
    keywords: ["電力供需", "台電", "停電", "備轉容量"],
    description:
      "整合臺灣電力公司與經濟部能源署開放資料，一頁掌握全臺各機組即時發電量、全國電源配比與核電廠周邊輻射偵測站即時劑量率。",
    directAnswer:
      "全臺電力概況儀表板整合臺電各機組即時發電量（每 10 分鐘更新）、經濟部能源署全國發電來源配比，以及核電廠周邊輻射偵測站即時劑量率，一頁式呈現全臺電力與核安監測現況。",
    scientificBasis: [
      {
        title: "臺灣電力公司各機組發電量即時資訊 (d006001)",
        authority: "臺灣電力股份有限公司 (Taipower)",
        url: "https://service.taipower.com.tw",
      },
      {
        title: "全國發電來源配比開放資料 (set_id=55)",
        authority: "經濟部能源署",
        url: "https://www.moeaea.gov.tw",
      },
      {
        title: "核電廠周邊輻射偵測站即時資訊 (d525001)",
        authority: "臺灣電力股份有限公司 (Taipower)",
        url: "https://service.taipower.com.tw",
      },
    ],
    relatedSlugs: ["water-conditions", "aqi", "cpc-prices"],
    faqs: [
      {
        question: "這個儀表板的三份資料分別是什麼？",
        answer:
          "分別是臺電各機組即時發電量（機組類型、裝置容量、淨發電量，每 10 分鐘更新）、經濟部能源署全國發電來源配比（臺電/民營電廠/汽電共生占比，僅 4 筆資料）、以及核一/核二/核三廠周邊輻射偵測站即時劑量率（安全監測用途）。",
      },
      {
        question: "輻射偵測站資料是停電資訊嗎？",
        answer:
          "不是。這份資料集（d525001）原先被誤以為是分區停電時段資料，但實際驗證後確認欄位是「站名、站號、劑量率(微西弗/小時)、日期時間、經度、緯度」，屬於核電廠周邊環境輻射安全監測，與停電時段無關。",
      },
      {
        question: "資料多久更新一次？",
        answer:
          "臺電各機組即時發電量與輻射偵測站資料每 10 分鐘自動同步一次；能源署全國發電來源配比因數值極少變動，採每日同步。本頁僅呈現最新快照，不提供歷史趨勢圖。",
      },
    ],
  },
  {
    // issue #483 (2.0 §D merge item M3): merged the standalone "cpc-stations"
    // (中油加油站服務據點地圖) catalog entry into this one. Unlike M1/M2 this was
    // a real content merge, not a duplicate-data retirement — the merged page
    // now covers both the weekly price bulletin AND the 20-amenity station
    // map behind two tabs ("本週油價"/"附近加油站"), so title/description/
    // directAnswer/faqs/keywords below cover both topics. `referenceTable`
    // (ToolCatalogEntry only supports one) is a small synthesized table
    // combining the most-queried rows from each original table rather than
    // either one alone.
    slug: "cpc-prices",
    group: "life-culture",
    lastUpdated: "2026-10-13",

    title: "中油油價查詢與加油站服務地圖",
    keywords: [
      "油價查詢",
      "中油牌價",
      "汽油價格",
      "加油站地圖",
      "中油加油站",
      "中油加油站查詢",
    ],
    description:
      "一頁整合臺灣中油（CPC）官方資訊的雙分頁工具：「本週油價」分頁即時查詢各式牌價，包含汽柴油零售（92/95/98/超級柴油）、家用天然氣、工業燃料油、桶裝液化石油氣（瓦斯）、海運用油、航空燃油、六大類油品、中油生技酒類及液化天然氣氣源成本分析；「附近加油站」分頁提供全臺 600 多座加油站服務地圖，可依洗車、電動車/機車充換電、來速咖啡（Cup Go）、輪胎打氣、自助加油與悠遊卡/一卡通等 20 大便民服務多選篩選並導航。",
    directAnswer:
      "本頁整合中油浮動油價公告（92/95/98 無鉛汽油、超級柴油、天然氣等全品項，每週日公布）與全臺 600 多座加油站便民服務地圖查詢，切換「本週油價」與「附近加油站」分頁即可取得對應資訊。",
    scientificBasis: [
      {
        title: "臺灣中油各項油品與氣品參考牌價開放資料",
        authority: "臺灣中油股份有限公司 (CPC)",
        url: "https://www.cpc.com.tw",
      },
      {
        title: "國內汽柴油參考零售價格機制",
        authority: "經濟部能源署",
        url: "https://www.moeaea.gov.tw",
      },
      {
        title: "中油加油站各項便民服務站點開放資料",
        authority: "臺灣中油股份有限公司 (CPC)",
        url: "https://www.cpc.com.tw",
      },
    ],
    referenceTable: {
      title: "中油核心油品與加油站便民服務對照表",
      headers: ["分頁", "品項/服務類別", "代表內容", "計價單位/適用對象", "更新頻率"],
      rows: [
        ["本週油價", "車用汽油", "98 / 95 / 92 無鉛汽油", "元/公升", "每週日公布、週一零點生效"],
        ["本週油價", "車用柴油", "超級柴油", "元/公升", "每週日公布、週一零點生效"],
        ["本週油價", "公用氣體", "天然氣 NG(1) / NG(2)、液化石油氣 (LPG)", "元/立方公尺、元/公斤", "每月 1-2 日生效"],
        ["附近加油站", "車輛清潔", "洗車服務、車用吸塵器", "一般自用車主", "依各站營業時段"],
        ["附近加油站", "綠能充換電", "電動汽/機車充電、換電站", "電動汽機車車主", "中油自有與合作業者快充樁"],
        ["附近加油站", "多元支付", "自助汽柴油、悠遊卡、一卡通、eTag", "廣大駕駛人", "全臺 600 多座站點支援"],
      ],
    },
    relatedSlugs: ["power-grid-overview", "youbike"],
    faqs: [
      {
        question: "中油油價什麼時候調整與公布？",
        answer:
          "中油依照浮動油價機制，每週日中午 12:00 公布最新國內汽、柴油參考零售價格，並於次日（週一）零時起生效。",
      },
      {
        question: "天然氣與桶裝瓦斯（LPG）牌價多久調整一次？",
        answer:
          "天然氣通常於每月 1 日依氣源成本機制公告調整；液化石油氣（桶裝瓦斯）通常於每月 2 日公告新期牌價。",
      },
      {
        question: "如何在地圖上快速找到有提供洗車或電動車充電的中油加油站？",
        answer:
          "切換到「附近加油站」分頁後，您可以直接點擊頂部的「快捷標籤」（如洗車服務、汽車充電、電動機車換電），或展開「20 項服務多選過濾」進行交集篩選，地圖會即時標出符合條件的站點。",
      },
      {
        question: "中油加油站的洗車與充氣服務時間跟加油站營業時間一樣嗎？",
        answer:
          "不一定。大部分加油站為 24 小時營業，但洗車服務通常為上午 8:00 至下午 17:00 或 18:00。點擊站點卡片可查看各項細項服務的具體營業時段。",
      },
    ],
    schemaType: "WebPage",
  },
  {
    // issue #256: merged the 4-tool "green certification family" —
    // "green-shops" (綠色商店查詢), "green-hotels" (環保標章旅館與綠色住宿查詢),
    // "green-products" (環保標章產品查詢) and "green-restaurants" (環保餐廳查詢)
    // — into one page with a certification-type tab. The shops/hotels/
    // restaurants tabs reuse the existing generic FacilitySearchContent +
    // facilitySearchConfigs (unchanged); the products tab reuses the existing
    // bespoke GreenProductsContent unmodified — see GreenCertificationsContent.tsx.
    // Indexability: green-shops was previously the one non-indexed member of
    // this family (group "public-facility"); the other three were indexed
    // (group "weather"). The merged page is indexed (see isToolIndexable) —
    // it is now a substantive, single canonical page comparing all four
    // certification types, not a thin single-type directory shell.
    slug: "green-certifications",
    group: "environment-food",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    navLabel: "環保標章查詢",
    title: "環保標章與綠色生活認證查詢",
    keywords: ["環保標章", "綠色生活認證", "綠色餐廳旅館"],
    description:
      "整合環境部認證之綠色商店、環保標章旅館、環保標章產品與環保餐廳名冊，可切換認證類型查詢。資料來源：環境部開放資料（gp_p_01、gp_p_02、gp_p_42、gp_p_43、epr_p_02、gis_p_11）。",
    directAnswer:
      "環保標章與綠色生活認證查詢整合環境部綠色商店、環保標章旅館（金/銀/銅級）、環保標章產品與環保餐廳四類認證名冊，可切換分頁查詢各類綠色消費據點與產品。",
    scientificBasis: [
      {
        title: "全民綠生活 - 綠色商店認證名冊",
        authority: "環境部 (MOENV)",
        url: "https://greenlifestyle.moenv.gov.tw",
      },
      {
        title: "環保標章旅館認證作業規範 (gp_p_42, gp_p_43)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
      {
        title: "環保標章資訊開放資料 (gp_p_02)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
      {
        title: "環保餐廳環境即時通地圖資料 (gis_p_11)",
        authority: "環境部 (MOENV)",
        url: "https://data.moenv.gov.tw",
      },
    ],
    relatedSlugs: ["public-toilets", "cool-spots", "carbon-footprint", "cleaning-squads"],
    faqs: [
      {
        question: "什麼是環境部認證綠色商店？",
        answer:
          "綠色商店是通過環境部認證、優先採購及販售環保標章商品的商店，資料來源為環境部認證名冊。切換上方「綠色商店」分頁即可查詢。",
      },
      {
        question: "環保標章旅館的分級標準？",
        answer:
          "環境部依節能、省水、減廢、綠色採購等面向，評定為金級、銀級與銅級環保標章旅館。切換上方「環保旅館」分頁即可查詢。",
      },
      {
        question: "什麼是環保標章產品？",
        answer:
          "經過環境部審查通過「低污染、省資源、可回收」之優良環境品質產品。切換上方「環保產品」分頁即可查詢。",
      },
      {
        question: "什麼是「環保餐廳」？",
        answer:
          "環保餐廳是環境部「環境即時通」平臺盤點響應減塑、節能減碳等環保作為之餐飲業者，供民眾用餐時可優先選擇具環保意識的店家。切換上方「環保餐廳」分頁即可查詢。",
      },
      {
        question: "這個頁面是否包含原本四個獨立工具的內容？",
        answer:
          "是。原「綠色商店查詢」「環保標章旅館與綠色住宿查詢」「環保標章產品查詢」「環保餐廳查詢」四個工具已合併為本頁，原網址皆已 301 轉址於此，切換上方分頁即可分別查看，資料範圍與更新來源維持不變。",
      },
    ],
  },
  {
    slug: "er-status",
    group: "medical-care",
    lastUpdated: "2026-10-12",

    schemaType: "MedicalWebPage",
    title: "全臺急救責任醫院急診即時看板",
    keywords: ["急診即時", "急診人數", "急診壅塞"],
    navLabel: "急診即時看板",
    description:
      "即時連線衛生福利部與全臺各重度級、中度級急救責任醫院急診即時訊息，提供等待看診人數、等待推床人數、等待住院人數、等待加護病房 (ICU) 人數與 119 滿線暫停後送通報，並繪製 24 小時人潮波動趨勢圖提供錯峰就醫參考。",
    directAnswer:
      "本站即時彙整全臺 200+ 家急救責任醫院急診數據，每 15 分鐘自動同步候診人數、推床數、加護病房空缺與 119 滿線通報，並提供近 24 小時走勢圖供民眾錯峰就診參考。",
    scientificBasis: [
      {
        title: "緊急醫療救護法與急救責任醫院分級標準",
        authority: "衛生福利部醫事司",
        url: "https://dep.mohw.gov.tw/DOMA/",
      },
      {
        title: "重度級急救責任醫院急診即時訊息通報規範",
        authority: "衛生福利部中央健康保險署",
        url: "https://info.nhi.gov.tw",
      },
    ],
    relatedSlugs: ["clinics", "aed", "health-checks", "rare-disease-care", "organ-donation-hospitals", "home-emergency-care"],
    faqs: [
      {
        question: "急診即時資訊多久更新一次？",
        answer:
          "本站資料每 15 分鐘自動同步衛福部健保署及各急救責任醫院最新通報資訊，反映現場等待看診、等待推床與住院人數。",
      },
      {
        question: "什麼是「119 滿線通報」？",
        answer:
          "當醫院急診室處於極度壅塞、醫護人力與急救推床已滿載時，會向各縣市消防局 119 救護指揮中心通報滿線，請救護車將非即刻危及生命之傷患改送其他責任醫院分流。",
      },
      {
        question: "什麼情況應該去急診？",
        answer:
          "急診依檢傷分類優先搶救生命垂危病患。若為持續高燒、嚴重胸痛、急性呼吸困難、意識不清、嚴重創傷等應立即就醫；若屬一般感冒輕微不適，建議白天至基層診所就醫，以獲得更充裕的診治時間並減輕急診壅塞。",
      },
    ],
  },
  {
    slug: "aed",
    group: "disaster-alerts",
    lastUpdated: "2026-10-12",

    schemaType: "MedicalWebPage",
    title: "全國公共場所 AED 急救地圖",
    keywords: ["心臟電擊", "自動體外心臟去顫器", "心臟急救", "電擊器"],
    navLabel: "AED急救地圖",
    description:
      "即時查詢全國公共場所自動體外心臟電擊去顫器 (AED) 設置地點、詳細放置位置、開放使用時間與緊急管理聯絡電話，結合 GPS 定位爭取黃金 4 分鐘急救時間，支援動態營業時間鎖定。",
    directAnswer:
      "AED（自動體外心臟電擊去顫器）是搶救心因性休克的關鍵設備。本工具即時定位身邊最近的 AED，顯示詳細放置樓層位置（如服務臺旁），並動態標註目前是否開放可立即取得。",
    scientificBasis: [
      {
        title: "公共場所必要設置自動體外心臟電擊去顫器之場所規範",
        authority: "衛生福利部醫事司",
        url: "https://tw-aed.mohw.gov.tw/",
      },
      {
        title: "心肺復甦術與自動體外心臟去顫器 (CPR+AED) 操作指引",
        authority: "中華民國急救加護醫學會 / 臺灣急診醫學會",
        url: "https://www.sem.org.tw",
      },
    ],
    relatedSlugs: ["er-status", "disaster-map", "clinics"],
    faqs: [
      {
        question: "AED 是什麼？誰可以使用？",
        answer:
          "AED（Automated External Defibrillator）是專為非醫事人員設計的心臟電擊器。只要開啟電源，機具會自動語音導引「貼上貼片」、「離患者」、「按電擊鈕」，法律設有緊急救護免責保護（善良撒瑪利亞人原則），一般民眾均可大膽施救。",
      },
      {
        question: "為什麼要過濾「目前開放中」？",
        answer:
          "部分 AED 設置於學校、機關大樓或特定運動場館內，在深夜或例假日會上鎖閉館。本工具能動態計算當下時間與營業時段，避免急救人員跑去上鎖場所撲空，爭取寶貴的黃金 4 分鐘。",
      },
      {
        question: "AED 急救口訣是什麼？",
        answer:
          "急救口訣為「叫、叫、C、D」：叫（確認意識呼吸）、叫（指定旁人叫 119 與拿 AED）、C（CPR 持續胸外按壓）、D（Defibrillation 開啟 AED 遵從語音電擊）。",
      },
    ],
  },
  {
    slug: "food-safety",
    group: "environment-food",
    lastUpdated: "2026-10-12",

    title: "全臺蔬果農藥殘留與食安檢驗透明看板",
    keywords: ["農藥殘留", "食安檢驗", "蔬果檢驗"],
    navLabel: "食安檢驗看板",
    description:
      "彙整農業部最新蔬果質譜快檢與食藥署邊境抽驗數據，提供臺灣常見蔬果合格率排行、常見超標違規農藥與毒物專家黃金流水清洗指南。",
    directAnswer:
      "輸入常見蔬菜或水果名稱，即時掌握半年官方抽驗合格率、常見違規超標農藥種類及正確清洗指引，避開高殘留風險蔬果。",
    scientificBasis: [
      {
        title: "農藥殘留質譜快檢技術標準與檢驗規範",
        authority: "農業部農業試驗所 (TARI)",
        url: "https://www.tari.gov.tw",
      },
      {
        title: "農藥殘留容許量標準與人體每日容許攝取量 (ADI)",
        authority: "衛生福利部食品藥物管理署 (TFDA)",
        url: "https://www.fda.gov.tw",
      },
    ],
    relatedSlugs: ["food-nutrition", "food-operators", "drugs", "pesticide-sales"],
    faqs: [
      {
        question: "用鹽水或小蘇打洗菜真的能去除更多農藥嗎？",
        answer:
          "農業部與毒物專家實驗證實：流動的自來水洗淨效果最好！鹽水會使蔬果表皮細胞脫水甚至讓水溶性農藥逆滲透；小蘇打雖對酸性農藥稍有中和，但一般民眾調配比例不當反而容易破壞營養。使用流動清水浸洗 10~15 分鐘是最科學安全的做法。",
      },
      {
        question: "為什麼洗草莓不能先摘掉蒂頭？",
        answer:
          "若先拔除蒂頭再清洗，蒂頭處的傷口會讓原本附著在表皮的農藥與髒水趁機滲透進草莓果肉內部，反而越洗越毒。正確做法是連同蒂頭在流水下浸洗沖刷 15 分鐘，食用前才摘除蒂頭。",
      },
      {
        question: "什麼是連續採收作物？為什麼農藥風險較高？",
        answer:
          "像四季豆、小黃瓜、番茄等作物屬於連續開花結果、連續採收。採收時同一植株上往往同時有成熟果實與幼小花苞，噴灑農藥保護幼果時，成熟果實容易被噴到而來不及經過安全採收期，因此需要特別加強清洗與川燙。",
      },
    ],
  },
  {
    slug: "outdoor-safety",
    group: "environment-food",
    lastUpdated: "2026-10-12",

    title: "全臺戶外運動與放電安全指數",
    keywords: ["戶外安全指數", "放電安全", "雷擊風險"],
    navLabel: "戶外安全指數",
    description:
      "跨表聚合即時氣象測站熱指數、空氣品質 AQI、紫外線 UV 與登革熱警戒，為跑者單車族、親子戶外放電與銀髮長輩提供今日戶外活動安全評分與黃金時段建議。",
    directAnswer:
      "整合環境部、氣象署與疾管署最新環境數據，為全臺 22 縣市計算 0~100 戶外綜合安全分數，並給予路跑最佳時段、共融公園放電與長輩散步防護指南。",
    scientificBasis: [
      {
        title: "中暑危險熱指數評估與高溫防護指引",
        authority: "交通部中央氣象署 (CWA)",
        url: "https://www.cwa.gov.tw",
      },
      {
        title: "空氣品質指標 (AQI) 與各族群活動建議",
        authority: "環境部大氣環境司",
        url: "https://airtw.moenv.gov.tw",
      },
    ],
    relatedSlugs: ["aqi", "uv", "weather-alerts", "aqx-monitoring"],
    faqs: [
      {
        question: "戶外活動安全指數是如何計算出來的？",
        answer:
          "本指標以 100 分為基準，綜合扣除空氣品質危害（AQI/PM2.5）、熱傷害風險係數（氣溫與濕度計算之中暑指數）、紫外線危險等級（UV 指數）與蚊媒疾病警戒。85 分以上為極佳，65 分以上良好，45 分以下建議改為室內運動。",
      },
      {
        question: "夏季路跑或騎單車的最佳時段是幾點？",
        answer:
          "夏秋季上午 10:00 至下午 16:00 紫外線與熱指數皆處於危險高峰，且午後臭氧濃度上升。建議跑者把握清晨 05:30~08:00 或日落後 18:30~20:30 之黃金練跑窗口，並每 15 分鐘補水 150ml。",
      },
      {
        question: "帶孩子去公園放電時，幾級紫外線需要防曬？",
        answer:
          "當紫外線指數達到 6（高量級）以上時，無防護暴露 30 分鐘即會曬傷；達到 8（過量級）以上時 20 分鐘即會受損。建議在樹蔭或溜滑梯遮陽棚下活動，並於出門前 20 分鐘為孩子塗抹溫和物理防曬乳。",
      },
    ],
  },
  {
    slug: "accessible-transit",
    group: "elder-care-welfare",
    lastUpdated: "2026-10-12",

    navLabel: "全臺無障礙交通地圖",
    title: "全臺無障礙交通地圖：低地板公車／捷運無障礙／通用計程車／復康巴士",
    keywords: ["無障礙交通", "低地板公車", "復康巴士", "通用計程車"],
    description:
      "即時查詢全臺 22 縣市低地板公車比率、臺北與高雄捷運及雙鐵無障礙乘車渡板預約、全臺通用無障礙計程車叫車平臺與各縣市復康巴士派車專線。",
    directAnswer:
      "全臺無障礙交通地圖整合交通部 TDX 與各直轄市低地板公車幹線、臺鐵高鐵捷運無障礙愛心導引設施，以及全臺 22 縣市復康巴士與通用計程車專線，保障身障者與長者安全無障礙出行。",
    scientificBasis: [
      {
        title: "交通部運輸資料流通服務 (TDX) 大眾運輸無障礙資訊",
        authority: "交通部",
        url: "https://tdx.transportdata.tw",
      },
      {
        title: "身心障礙者權益保障法與大眾運輸通用設計規範",
        authority: "衛生福利部社會及家庭署",
        url: "https://www.sfaa.gov.tw",
      },
    ],
    relatedSlugs: ["metro-alerts", "youbike", "disability-atm", "long-term-care", "senior-friendly"],
    faqs: [
      {
        question: "如何預約捷運或臺鐵的無障礙愛心乘車渡板服務？",
        answer:
          "搭乘捷運可於抵達前撥打站務電話或至詢問處提出需求，站務員將攜帶手動渡板於車廂月臺端協助上下車；搭乘臺鐵請於發車前 2 小時撥打客服專線 0800-765888 預約愛心接送。",
      },
      {
        question: "搭乘低地板公車輪椅族該注意哪些事項？",
        answer:
          "於公車站揮手示意並告知司機搭乘輪椅，司機將手動降下車身並拉出後門斜坡板；上車後請將輪椅背向車頭停放於專屬輪椅席，扣緊安全帶並固定煞車。",
      },
      {
        question: "復康巴士與長照交通接送（長照 2.0）有何不同？",
        answer:
          "復康巴士主要服務持有身心障礙證明者，由社會局補貼，採點對點計程車費率約三分之一計費；長照交通接送則針對長照失能等級第 4 級以上之高齡長輩，補助點對點往返醫療院所看診復健。",
      },
    ],
  },
  {
    slug: "inundation-map",
    group: "disaster-alerts",
    lastUpdated: "2026-10-12",

    navLabel: "全臺積淹水即時感測地圖",
    title: "全臺積淹水即時感測地圖：路面淹水／水位防汛警戒／避難收容處所",
    keywords: ["積水地圖", "淹水感測", "防汛警戒"],
    description:
      "整合經濟部水利署各河川分署 IoT 路面即時公分級水深感測器、河川水位站一至三級防汛溢堤警戒，以及周邊緊急避難收容處所。遇颱風豪雨，提供用路人低窪涵洞避災與疏散指引。",
    directAnswer:
      "全臺積淹水即時感測地圖整合水利署路面 IoT 感測器即時水深、370 個河川水位站警戒狀態與鄰近避難收容學校，警示積水深度超過 10cm 與 30cm 之危險路段。",
    scientificBasis: [
      {
        title: "經濟部水利署水資源物聯網 (WRA IoT) 開放資料平臺",
        authority: "經濟部水利署 (WRA)",
        url: "https://iot.wra.gov.tw",
      },
      {
        title: "天然災害應變水情與避難收容作業規範",
        authority: "國家災害防救科技中心 (NCDR)",
        url: "https://www.ncdr.nat.gov.tw",
      },
    ],
    relatedSlugs: ["water-conditions", "disaster-map", "weather-alerts", "outdoor-safety"],
    faqs: [
      {
        question: "路面淹水感測器的水深是如何測量的？",
        answer:
          "水利署於全臺易積水路口、地下道與涵洞安裝超音波或壓力式液位感測器，以 IoT 無線通訊即時回傳公分級（cm）水深數據，每 5 至 10 分鐘更新一次。",
      },
      {
        question: "積水多深時汽車就不可以強行開過去？",
        answer:
          "一般自小客車輪胎直徑約 60cm，當路面積水達到輪胎半徑（約 15~20cm）時，極易湧入排氣管或進氣口導致引擎熄火；當積水達到 30cm 時，車身浮力將使車輛失控漂流，切勿冒險涉水。",
      },
      {
        question: "車輛若不幸於低窪地下道泡水熄火該如何處置？",
        answer:
          "千萬不可再次發動引擎（會將積水直接吸入汽缸造成嚴重毀損）；應立即解開安全帶、開啟車門或破窗移往高處安全避難，並撥打 119 或道路救援求助。",
      },
    ],
  },
  {
    slug: "health-supplements",
    title: "健康食品認證查詢：衛福部食藥署健字號許可登記",
    keywords: ["健字號", "健康食品認證", "保健食品"],
    navLabel: "健康食品認證",
    description:
      "即時查詢衛生福利部食品藥物管理署審查通過之健康食品（小綠人標章）與許可證字號，包含審定保健功效、成分、申請廠商與警語。",
    directAnswer:
      "健康食品係指具有實質科學證據之保健功效，並向衛福部申請查驗登記發給許可證（健字號）之食品，非屬治療疾病之藥品。",
    scientificBasis: [
      {
        title: "衛生福利部食品藥物管理署《健康食品管理法》",
        authority: "衛生福利部食品藥物管理署",
        url: "https://www.fda.gov.tw/",
      },
    ],
    relatedSlugs: ["food-safety", "nutrition", "food-nutrition", "food-operators"],
    group: "medical-care",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    faqs: [
      {
        question: "「健康食品」與一般口語常說的「保健食品」有何法律區別？",
        answer:
          "在臺灣只有依《健康食品管理法》經食藥署審查通過並取得「健字號」許可證的產品才可合法稱為「健康食品」並宣稱特定保健功效；一般市售保健食品僅是一般食品，依法不得宣稱任何療效或保健功效。",
      },
      {
        question: "健康食品（健字號）常見的核可保健功效有哪些？",
        answer:
          "目前食藥署公告核可的功效項目包括：調節血脂、胃腸功能改善、護肝功能、免疫調節、骨質保健、不易形成體脂肪、輔助調節血糖、延緩衰老等 13 項。",
      },
    ],
  },
  {
    slug: "sheltered-workshops",
    title: "全國庇護工場地圖：身障手作商品與公益據點查詢",
    keywords: ["庇護工場", "身障手作商品"],
    navLabel: "庇護工場地圖",
    description:
      "即時查詢全國各縣市身心障礙者庇護工場、公益烘焙伴手禮、手工皂及庇護就業服務據點。資料來源：勞動部勞動力發展署。",
    directAnswer:
      "庇護工場是為具有就業意願但就業能力不足的身心障礙者設立之支持性就業場所，提供庇護性工作機會與職業技能培力。",
    scientificBasis: [
      {
        title: "勞動部勞動力發展署《身心障礙者權益保障法》庇護工場管理規範",
        authority: "勞動部勞動力發展署",
        url: "https://www.wda.gov.tw/",
      },
    ],
    relatedSlugs: ["disability-welfare", "disability-atm", "npo-organizations"],
    group: "elder-care-welfare",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    faqs: [
      {
        question: "什麼是身心障礙庇護工場？",
        answer:
          "庇護工場是由政府立案輔導之機構，提供身心障礙者適應性就業環境與工作訓練，常見業務包括烘焙甜點、咖啡包裝、洗車美容、清潔勞務與文創手工藝。",
      },
      {
        question: "民眾或企業購買庇護工場商品有哪些意義？",
        answer:
          "購買庇護商品能直接支持身心障礙學員自立更生、獲得勞動薪資與成就感，企業採購亦可申報符合政府進用身心障礙者相關差額補助或公益採購指標。",
      },
    ],
  },
  {
    slug: "mental-health",
    title: "全國心理諮商所與成癮防治地圖：心衛中心、藥癮戒治機構查詢",
    keywords: ["心理諮商所", "心理師", "心衛中心", "藥癮戒治", "戒毒", "替代治療"],
    navLabel: "心理諮商所地圖",
    description:
      // issue #566: 新增「成癮防治」分頁（全國藥癮戒治與替代治療機構），描述改成
      // 涵蓋兩種資料類型，但刻意不提美沙冬／毒防中心——那兩類資料由 #571 補上，
      // 留給那張票自己補這段文字，避免兩張票搶著改同一段描述造成衝突。
      "查詢衛福部合法立案之公私立心理諮商所、臨床心理所與各縣市社區心理衛生中心，支援 1925 安心專線與專業晤談預約；另設「成癮防治」分頁，收錄全國藥癮戒治與替代治療機構，顯示法務部戒毒成功專線 0800-770-885。",
    directAnswer:
      "心理諮商係由考選部及格、領有執照之諮商或臨床心理師所提供之專業心理晤談與評估，協助處理情緒困擾、創傷及人際議題；頁內另有「成癮防治」分頁可查詢全國藥癮戒治機構。",
    scientificBasis: [
      {
        title: "衛生福利部心理健康司《心理師法》及立案機構規範",
        authority: "衛生福利部心理健康司",
        url: "https://dep.mohw.gov.tw/DOMHAOH/",
      },
      {
        title: "各縣市指定藥癮戒治機構及替代治療機構及非鴉片類藥癮治療補助機構",
        authority: "臺北市立聯合醫院（data.gov.tw 133353）",
        url: "https://data.gov.tw/dataset/133353",
      },
    ],
    relatedSlugs: ["stress", "sleep", "clinics"],
    group: "medical-care",
    lastUpdated: "2026-10-14",
    newsTopic: "anti-drug",

    schemaType: "MedicalWebPage",
    faqs: [
      {
        question: "遇有心理低潮或情緒困擾，有哪些免費官方求助管道？",
        answer:
          "衛福部設有 24 小時免付費心理諮詢「1925 安心專線」（依舊愛我），各縣市亦設有社區心理衛生中心提供免費或平價的駐點心理晤談諮詢服務。",
      },
      {
        question: "諮商心理師與臨床心理師有何不同？",
        answer:
          "兩者皆為國家高等考試及格之專業心理師；臨床心理師側重於精神病理衡鑑、腦部認知功能評估與重大精神疾患心理治療，諮商心理師則專精於人際關係、職涯、情緒探索與壓力調適。",
      },
      {
        question: "家人有藥癮問題，可以撥打哪支專線求助？",
        answer:
          "可撥打法務部戒毒成功專線 0800-770-885（24 小時免付費），或在本頁切換到「成癮防治」分頁，查詢離家最近的藥癮戒治與替代治療機構。",
      },
    ],
  },
  {
    slug: "smoking-cessation",
    title: "戒菸門診特約院所查詢：二代戒菸補助與戒菸衛教",
    keywords: ["戒菸門診", "二代戒菸", "戒菸補助", "戒菸院所查詢"],
    navLabel: "戒菸門診查詢",
    description:
      "查詢衛生福利部國民健康署二代戒菸治療與戒菸衛教補助之特約醫院、基層診所與社區藥局示例，享藥品免部分負擔；目前僅收錄部分示例，完整的全國合約院所名單請至國民健康署戒菸服務查詢。",
    directAnswer:
      "二代戒菸服務由國健署補助戒菸門診診察費與戒菸藥品費用，透過專業醫師評估與尼古丁替代療法大幅提升戒菸成功率。",
    scientificBasis: [
      {
        title: "衛生福利部國民健康署《菸害防制法》二代戒菸治療試辦計畫",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw/",
      },
      {
        title: "國民健康署戒菸服務查詢（完整全國合約院所名單）",
        authority: "衛生福利部國民健康署",
        url: "https://ttc.hpa.gov.tw/",
      },
    ],
    relatedSlugs: ["clinics", "pharmacies", "health-checks"],
    group: "medical-care",
    lastUpdated: "2026-10-14",
    newsTopic: "tobacco",

    schemaType: "MedicalWebPage",
    faqs: [
      {
        question: "什麼是二代戒菸服務？補助內容有哪些？",
        answer:
          "政府補助每人每年最多 2 個療程（每療程 8 週），包含戒菸門診診察費、專業戒菸衛教與戒菸藥品，目前戒菸藥品已免收部分負擔費用。",
      },
      {
        question: "自行戒菸與到戒菸門診求助成功率有何差異？",
        answer:
          "單靠個人意志力戒菸之年成功率通常僅約 3~5%，而在專業醫師指導並搭配尼古丁貼片或口服藥物輔助下，成功率可大幅提升至 30% 以上。",
      },
    ],
  },
  {
    slug: "adult-preventive-care",
    title: "成人健檢與公費癌症篩檢院所查詢",
    keywords: ["成人健檢", "公費癌症篩檢", "免費健檢"],
    navLabel: "成人健檢與癌篩",
    description:
      "查詢全國提供 40 歲以上公費成人健康檢查與子宮頸抹片、乳房X光、大腸癌糞便潛血及口腔黏膜四癌篩檢特約院所名冊。",
    directAnswer:
      "公費成人健檢提供40至64歲民眾每3年一次、65歲以上每年一次之身體檢查與血液生化檢驗，並涵蓋衛福部公費四癌早期篩檢。",
    scientificBasis: [
      {
        title: "衛生福利部國民健康署成人預防保健服務作業指引",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw/",
      },
    ],
    relatedSlugs: ["health-checks", "clinics", "blood-pressure"],
    group: "medical-care",
    lastUpdated: "2026-10-12",

    schemaType: "MedicalWebPage",
    faqs: [
      {
        question: "公費成人預防保健檢查的補助資格與頻率？",
        answer:
          "40至64歲民眾每 3 年享有 1 次公費檢查；65歲以上長者、55歲以上原住民及35歲以上罹患小兒麻痺者，則每年享有 1 次公費成人健檢服務。",
      },
      {
        question: "衛福部提供的公費四癌篩檢包含哪些對象？",
        answer:
          "包含：子宮頸抹片（30歲以上女性每年1次）、乳房X光攝影（45至69歲或40至44歲具家族史女性每2年1次）、糞便潛血檢查（50至74歲民眾每2年1次）、口腔黏膜檢查（30歲以上嚼檳榔或吸菸者每2年1次）。",
      },
    ],
  },
  {
    slug: "baby-friendly-hospitals",
    title: "母嬰親善醫療院所地圖：母嬰同室與母乳哺育認證醫院",
    keywords: ["母嬰親善醫院", "母嬰同室", "母乳哺育"],
    navLabel: "母嬰親善醫療院所",
    description:
      "查詢臺北市、新北市、臺中市、臺南市、彰化縣五縣市衛生局公告之母嬰親善醫療院所名單，自動排除已過效期的紀錄並標示各縣市資料查證日期。其餘縣市（例如高雄市，現有公告效期已全數落在 2016～2019 年、不堪作為現行名單使用）尚未收錄，請洽當地衛生局確認最新名冊。",
    directAnswer:
      "母嬰親善醫院係指符合世界衛生組織及國健署母嬰親善認證基準、落實 24 小時母嬰同室並全面推廣純母乳哺育之醫療院所；本站目前僅收錄臺北市、新北市、臺中市、臺南市、彰化縣五縣市衛生局公告且仍在效期內的認證名單，其餘縣市尚未收錄。",
    scientificBasis: [
      {
        title: "衛生福利部國民健康署母嬰親善醫療院所認證基準",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw/",
      },
    ],
    relatedSlugs: ["breastfeeding-rooms", "postpartum-care", "contraception-map", "child-welfare-institutions", "accessible-parking", "child-subsidies"],
    group: "family",
    lastUpdated: "2026-10-14",

    schemaType: "MedicalWebPage",
    faqs: [
      {
        question: "什麼是母嬰親善醫療院所認證？",
        answer:
          "係依據 WHO 促進母乳哺育成功十大原則評核之認證標章，要求院所實施產後即刻肌膚接觸、24小時母嬰同室、不主動推銷配方奶，並有專業醫護提供母乳哺育技術輔導。",
      },
      {
        question: "實施「24小時母嬰同室」對新生兒與產婦有何益處？",
        answer:
          "母嬰同室能讓母親即時辨識新生兒飢餓訊號並依需求餵食，促進母乳分泌並建立安全依附感，同時降低新生兒院內交叉感染風險。",
      },
      {
        question: "為什麼我所在的縣市查不到母嬰親善醫院？",
        answer:
          "本工具目前只收錄臺北市、新北市、臺中市、臺南市、彰化縣這五縣市衛生局公告且仍在效期內的名單；其餘縣市（例如高雄市，現有公告效期已全數過期）尚未收錄，或該縣市公告名單剛好全數過期，兩種情況都會顯示「本縣市暫無有效名單，請洽當地衛生局」，請直接向當地衛生局確認最新名冊。",
      },
    ],
  },
  {
    slug: "child-subsidies",
    title: "育兒補助總覽：育兒津貼／托育補助／就學補助／生育補助快速查詢",
    keywords: [
      "育兒津貼",
      "托育補助",
      "就學補助",
      "生育補助10萬",
      "試管嬰兒補助3.0",
      "準公共托嬰",
      "準公共幼兒園",
      "0-18歲成長津貼",
      "台灣兒少成長及未來帳戶條例",
    ],
    navLabel: "育兒補助總覽",
    description:
      "彙整育兒津貼、0–2歲托育補助、2–6歲就學補助／育兒津貼、5歲就學補助、生育補助與試管嬰兒補助3.0等7項現行育兒相關補助，附純前端快速查詢（輸入年齡、照顧方式、胎次與福利身分即可試算金額，不送出任何資料），並以中性說明彙整尚未上路的0–18歲成長津貼兩個競爭方案。",
    directAnswer:
      "育兒補助總覽彙整育兒津貼、托育補助、2–6歲就學補助、5歲就學補助、生育補助（每胎10萬元）、試管嬰兒補助3.0等7項現行制度的金額與資格，並提供純前端快速查詢試算；尚未上路的0–18歲成長津貼（行政院版與立法院三讀之在野黨版）另闢專區中性說明，不列入試算。",
    scientificBasis: [
      {
        title: "育兒津貼及托育準公共化實施計畫",
        authority: "衛生福利部社會及家庭署",
        url: "https://www.sfaa.gov.tw/sfaa/list/5e0",
      },
      {
        title: "2歲以上未滿5歲幼兒育兒津貼及5歲至入國民小學前幼兒就學補助",
        authority: "教育部全國教保資訊網",
        url: "https://www.ece.moe.edu.tw/ch/subsidy/",
      },
      {
        title: "勞工保險生育給付加發生育補助作業要點",
        authority: "勞動部勞工保險局",
        url: "https://www.mol.gov.tw/1607/1632/1640/84736/",
      },
      {
        title: "擴大不孕症（試管嬰兒）治療補助方案3.0",
        authority: "衛生福利部國民健康署",
        url: "https://mohw.gov.tw/cp-16-85394-1.html",
      },
    ],
    relatedSlugs: ["emergency-hotlines", "baby-friendly-hospitals", "child-welfare-institutions"],
    group: "family",
    lastUpdated: "2026-10-14",

    schemaType: "WebPage",
    faqs: [
      {
        question: "育兒津貼和托育補助可以一起領嗎？",
        answer:
          "不行，兩者互斥、只能擇一請領。送公共化托育機構或準公共保母／托嬰中心的家庭請領托育補助（金額較高，依機構類型與胎次每月7,000至15,000元不等）；自行照顧或未送上述機構的家庭則請領育兒津貼（每月5,000至7,000元）。",
      },
      {
        question: "就讀公立、非營利或準公共幼兒園後，還能再領2–6歲育兒津貼或5歲就學補助嗎？",
        answer:
          "不能。就讀這三類「平價教保服務機構」的幼兒，改以政府直接支付幼兒園差額、家長每月自付金額設有上限（公立最高1,000元、非營利最高2,000元、準公共最高3,000元，依胎次遞減，低收入戶／中低收入戶一律免費）的方式減輕負擔，不得同時請領現金形式的育兒津貼或5歲就學補助。",
      },
      {
        question: "生育補助10萬元和試管嬰兒補助3.0是什麼時候開始的？",
        answer:
          "生育補助自115（2026）年1月1日起由政府另編公務預算，將請領勞保生育給付之本國籍女性勞工（含與本國籍結婚之外籍配偶）的每胎給付加發至合計10萬元；試管嬰兒補助3.0自114（2025）年11月1日起實施，受術妻未滿39歲者第1次療程最高補助15萬元。",
      },
      {
        question: "0–18歲成長津貼是現在就能申請的補助嗎？",
        answer:
          "還不能。0–18歲成長津貼目前有行政院版方案與立法院三讀通過之在野黨版《台灣兒少成長及未來帳戶條例》兩案並存，且行政院已對立法院三讀版本不予副署，爭議尚未解決，兩案皆尚未正式上路。本工具將其列在「已宣布、尚未上路」區塊中性說明，不會出現在快速查詢結果中，請以主管機關正式公告為準。",
      },
      {
        question: "快速查詢會不會把我輸入的年齡、所得狀況送到伺服器或記錄下來？",
        answer:
          "不會。快速查詢的比對計算完全在瀏覽器端進行，資料在頁面載入時就已經由伺服器端一次性傳入，之後選擇年齡、照顧方式、胎次或福利身分都不會發出任何網路請求，也不會寫入瀏覽器的本機儲存空間。",
      },
    ],
  },
  {
    slug: "rare-disease-care",
    title: "罕見疾病照護諮詢中心與確診醫院查詢",
    keywords: ["罕見疾病", "罕病照護", "罕病醫院"],
    navLabel: "罕病照護中心",
    description:
      "查詢國民健康署指定之全臺罕見疾病照護諮詢中心、遺傳醫學諮詢窗口與重大罕見疾病確診醫療機構名冊與服務專線。",
    directAnswer:
      "罕見疾病照護諮詢中心由專科醫療團隊提供罕病患者全人照護、營養諮詢、基因診斷、心理支持及生育遺傳衛教服務。",
    scientificBasis: [
      {
        title: "衛生福利部國民健康署《罕見疾病防治及藥物法》照護諮詢中心計畫",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw/",
      },
    ],
    relatedSlugs: ["clinics", "er-status", "health-checks"],
    group: "medical-care",
    lastUpdated: "2026-10-12",

    schemaType: "MedicalWebPage",
    faqs: [
      {
        question: "罕見疾病照護諮詢中心提供哪些具體服務？",
        answer:
          "中心提供罕病患者與家屬就醫諮詢、疾病相關知識衛教、心理諮商、營養評估、生育遺傳諮詢及社會福利資源媒合服務。",
      },
      {
        question: "罕見疾病確診後可享有何種健保與政府補助權益？",
        answer:
          "經國健署公告之罕見疾病患者，可申請重大傷病卡免除該疾病就醫之部分負擔，並可申請罕見疾病特殊營養品及維持生命所需之昂貴罕病用藥補助。",
      },
    ],
  },
  {
    slug: "organ-donation-hospitals",
    title: "器官捐贈指定責任醫院查詢：器捐意願簽署與勸募網絡",
    keywords: ["器官捐贈", "器捐", "器捐意願書"],
    navLabel: "器捐責任醫院",
    description:
      "查詢衛福部器官捐贈勸募網絡指定責任醫院名冊，提供大愛器捐諮詢、健保卡器捐意願註記簽署與安寧緩和諮詢窗口。",
    directAnswer:
      "器官捐贈勸募責任醫院負責腦死判定、大愛器官勸募、移植配對協調與家屬關懷撫慰，並受理民眾健保卡器官捐贈意願書簽署。",
    scientificBasis: [
      {
        title: "衛生福利部醫事司《人體器官移植條例》與國家器官捐贈網絡",
        authority: "衛生福利部醫事司",
        url: "https://dep.mohw.gov.tw/DOMA/",
      },
    ],
    relatedSlugs: ["clinics", "long-term-care", "er-status"],
    group: "medical-care",
    lastUpdated: "2026-10-12",

    schemaType: "MedicalWebPage",
    faqs: [
      {
        question: "如何簽署器官捐贈同意書並註記於健保IC卡？",
        answer:
          "凡成年人皆可至全臺各大醫院社服室、志工服務臺或線上透過自然人憑證填寫「器官捐贈同意書」，審核通過後即會註記於健保卡晶片中。",
      },
      {
        question: "簽署器捐意願後，若發生緊急狀況醫師會不會放棄搶救？",
        answer:
          "絕對不會。醫療團隊的首要任務是全力搶救病患生命；只有在經兩次嚴格腦死判定程序確定腦死，且無法挽回生命時，才會啟動器捐確認程序。",
      },
    ],
  },
  {
    slug: "home-emergency-care",
    title: "健保在宅急症照護特約機構查詢：在宅施打抗生素醫療",
    keywords: ["在宅急症照護", "在宅抗生素", "住院替代"],
    navLabel: "在宅急症特約機構",
    description:
      "查詢中央健保署在宅急症照護試辦計畫特約院所，針對肺炎、尿路感染、軟組織感染長者提供到宅施打抗生素與遠距生理監控。",
    directAnswer:
      "在宅急症照護由醫師、護理師與藥師組成行動團隊，針對符合適應症之感染症病患到宅治療與監測，讓長輩免於急診奔波。",
    scientificBasis: [
      {
        title: "衛生福利部中央健康保險署在宅急症照護試辦計畫實施要點",
        authority: "衛生福利部中央健康保險署",
        url: "https://www.nhi.gov.tw/",
      },
    ],
    relatedSlugs: ["long-term-care", "clinics"],
    group: "medical-care",
    lastUpdated: "2026-10-12",

    schemaType: "MedicalWebPage",
    faqs: [
      {
        question: "在宅急症照護主要收治哪些病症？",
        answer:
          "主要涵蓋三類常見感染症：肺炎、泌尿道感染以及軟組織感染（如蜂窩性組織炎），經醫師評估病情穩定者可在自家或安養機構在家住院接受治療。",
      },
      {
        question: "在宅急症照護期間如何掌握病患生理變化？",
        answer:
          "行動醫療團隊每日到宅訪視與注射抗生素，並搭配連續體溫、血壓、血氧遠距生理監控設備，結合綠色通道後送機制，兼顧照護品質與安全。",
      },
    ],
  },
  {
    slug: "pesticide-sales",
    title: "合法農藥販賣業執照據點查詢：植物保護資材地圖",
    keywords: ["農藥行", "農藥販賣業", "植物保護資材"],
    navLabel: "合法農藥資材據點",
    description:
      "查詢農業部動植物防疫檢疫署核發合法農藥販賣業執照之經銷門市、植物保護資材營業據點，保障農作安全用藥與資材來源。",
    directAnswer:
      "合法農藥販賣業須經農業主管機關審查核發執照，並由專任管理人員管理農藥儲放，確保農作安全採收期與合規用藥指引。",
    scientificBasis: [
      {
        title: "農業部動植物防疫檢疫署《農藥管理法》農藥販賣業管理準則",
        authority: "農業部動植物防疫檢疫署",
        url: "https://www.aphia.gov.tw/",
      },
    ],
    relatedSlugs: ["food-safety", "pest-alerts", "green-certifications"],
    group: "environment-food",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    faqs: [
      {
        question: "為何農友購買植物保護資材應選擇合法農藥販賣業者？",
        answer:
          "合法業者販售經農業部登記許可、來源明確之正牌藥劑，並備有合格植物保護專業諮詢人員，避免農民誤用未核准偽劣農藥導致農藥殘留超標或罰鍰。",
      },
      {
        question: "購買農藥時依法需要配合哪些實名制規定？",
        answer:
          "依農藥管理法規定，農民購買農藥時應出示身分證明文件，業者需登錄購買人身分、購買品項與數量，並上傳防檢署農藥銷售管理系統備查。",
      },
    ],
  },
  {
    slug: "hearing-aid-subsidies",
    title: "助聽器評估特約醫療院所查詢：公費聽力輔具評估",
    keywords: ["助聽器補助", "聽力輔具評估", "公費助聽器"],
    navLabel: "助聽器評估院所",
    description:
      "查詢衛生福利部社會及家庭署身心障礙輔具補助指定之助聽器聽力檢查與效益驗證特約醫學中心、耳鼻喉專科醫療機構名冊。",
    directAnswer:
      "助聽器評估特約院所由合格聽力師進行純音聽力檢查與助聽器選配驗證，開立輔具評估報告書以申領政府身心障礙輔具補助。",
    scientificBasis: [
      {
        title: "衛生福利部社會及家庭署身心障礙者輔具費用補助基準表",
        authority: "衛生福利部社會及家庭署",
        url: "https://www.sfaa.gov.tw/",
      },
    ],
    relatedSlugs: ["clinics", "disability-welfare", "long-term-care"],
    group: "elder-care-welfare",
    lastUpdated: "2026-10-12",

    schemaType: "MedicalWebPage",
    faqs: [
      {
        question: "申請助聽器政府公費補助的基本流程？",
        answer:
          "申請流程為：1. 至特約醫療院所進行聽力檢查開立輔具評估報告書（第9號或第25號）；2. 向戶籍所在地社會局或輔具中心提出申請核定；3. 購買助聽器後回院所進行效益驗證並檢據核銷。",
      },
      {
        question: "助聽器補助金額與資格限制？",
        answer:
          "領有身心障礙證明（聽覺障礙或聽力障礙多重障礙者），依身心障礙程度與福利身分（低收、中低收、一般戶），單耳補助最高從數千元至兩萬元不等，雙耳可分別申請。",
      },
    ],
  },
  {
    slug: "funeral-facilities",
    title: "全國合法公私立殯葬設施地圖：公墓／納骨塔／禮儀業者",
    keywords: ["殯葬設施", "公墓", "納骨塔", "禮儀業者"],
    navLabel: "合法殯葬設施",
    description:
      "查詢內政部全國殯葬資訊網登記立案之合法公立與私立公墓、納骨塔（骨灰骸存放設施）、火化場與合法生命禮儀服務公司。",
    directAnswer:
      "合法殯葬設施受地方殯葬管理條例規範，提供合規之殯儀館設施、火化爐具、骨灰骸存放與環保自然葬登記，防杜未立案設施紛爭。",
    scientificBasis: [
      {
        title: "內政部《殯葬管理條例》全國合法殯葬設施透明化規範",
        authority: "內政部民政司",
        url: "https://mort.moi.gov.tw/",
      },
    ],
    relatedSlugs: ["long-term-care", "npo-organizations", "public-toilets"],
    group: "elder-care-welfare",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    faqs: [
      {
        question: "選擇合法公墓與合法骨灰骸存放設施（納骨塔）的重要性？",
        answer:
          "未經核准之非法墓地或違建納骨塔可能面臨主管機關強制取締拆遷、無法取得合法使用憑證或產權糾紛，選擇民政局立案之合法設施才能保障長久權益。",
      },
      {
        question: "近年推廣的「環保自然葬」包含哪些形式？",
        answer:
          "常見包含樹葬、花葬、植存、草葬以及海葬，遺體火化後將骨灰研磨處理植入土壤回歸自然，不立碑、不造墳，多數縣市公立自然葬園區免收規費或提供實質補助。",
      },
    ],
  },
  {
    slug: "water-outages",
    group: "disaster-alerts",
    lastUpdated: "2026-10-12",

    navLabel: "全臺即時停水查詢",
    title: "全臺即時停水與供水站地圖：自來水管線修復／計畫停水／取水點查詢",
    keywords: ["停水查詢", "停水公告", "供水站", "計畫停水"],
    description:
      "即時查詢臺灣自來水公司與臺北自來水事業處突發管線破裂搶修、定期計畫性施工停水與水壓降低區域，並提供鄰近緊急臨時供水站與取水車地圖定位導航。",
    directAnswer:
      "全臺即時停水地圖整合台水與北水即時通報，提供突發破管搶修、預告計畫停水時段、影響戶數與周邊臨時緊急供水站/水車經緯度位置，守護民生用水與防災韌性。",
    scientificBasis: [
      {
        title: "台灣自來水公司即時停水資訊開放資料平臺",
        authority: "台灣自來水股份有限公司 (TWC)",
        url: "https://www.water.gov.tw",
      },
      {
        title: "臺北自來水事業處即時停水公告與水質監測系統",
        authority: "臺北自來水事業處 (TWD)",
        url: "https://www.water.gov.taipei",
      },
      {
        title: "天然災害自來水應變調度與臨時供水站開設規範",
        authority: "經濟部水利署 (WRA)",
        url: "https://www.wra.gov.tw",
      },
    ],
    referenceTable: {
      title: "停水應變與民生儲水安全指引對照表",
      headers: ["階段", "應變要點", "抽水設備防護", "水質與衛生須知"],
      rows: [
        [
          "停水前整備",
          "提前儲備 3 天每人每日 3-5 公升飲用及衛生水源",
          "提早關閉抽水馬達電源，避免空轉",
          "使用食品級乾淨有蓋儲水桶密封貯存",
        ],
        [
          "停水期間",
          "查詢鄰近臨時供水站與水車點位備援取水",
          "嚴禁開啟加壓抽水機，防止負壓吸入污水",
          "自備乾淨取水容器，先滿足飲用及炊事需求",
        ],
        [
          "剛復水初期",
          "檢查水龍頭出水是否混濁或含有泥沙氣泡",
          "待水壓恢復穩定後再開啟抽水馬達",
          "先放水 1-2 分鐘排空初期管底水，煮沸後飲用",
        ],
      ],
    },
    relatedSlugs: ["inundation-map", "water-conditions", "disaster-map", "outdoor-safety"],
    schemaType: "WebPage",
    faqs: [
      {
        question: "停水期間為什麼必須立刻關閉抽水馬達電源？",
        answer:
          "若停水期間未關閉抽水馬達，馬達感測無水持續空轉極易過熱燒毀，甚至可能引發火災；同時，在地下管線失壓狀態下強行抽水，容易產生負壓虹吸效應將外圍土壤污水吸入自來水管造成二次水質污染。",
      },
      {
        question: "如何查詢離家最近的臨時緊急供水站或水車？",
        answer:
          "本工具即時整合台灣自來水公司與北水處開設之臨時供水站點，在地圖上以藍色水龍頭圖標標註，點擊即可查看取水地點、開放取水時間、水車類型並直接啟動 Google 地圖導航前往。",
      },
      {
        question: "剛恢復供水時自來水變白或變黃可以馬上喝嗎？",
        answer:
          "剛復水時水質混濁常因管線內空氣溶解產生微小氣泡（呈乳白色，靜置片刻即透明消散）或管壁初期鐵鏽剝落（呈黃褐色）。建議先開啟一般水龍頭流放 1 至 2 分鐘沖洗水管，待出水清澈並煮沸後再安心飲用。",
      },
    ],
  },
  {
    slug: "emergency-hotlines",
    group: "disaster-alerts",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "全臺急用緊急專線速查與直撥目錄",
    keywords: ["緊急專線", "報案電話", "緊急聯絡電話"],
    navLabel: "緊急專線速查",
    description:
      "彙整全臺 47+ 組官方特殊服務簡碼、急難求救專線與各縣市 1999 直撥代表號，提供 110、119、112、113、118 一鍵快速撥號、即時關鍵字模糊搜尋、22 縣市分流切換與離線零延遲應急查詢。",
    directAnswer:
      "全臺急用緊急專線速查彙整 110（警政報案）、119（消防急救）、112（全球行動求救）、113（家暴性侵保護）、118（海難搜救）、165（反詐騙）、1925（安心協談）、1966（長照）與全臺 22 縣市 1999 直撥市話代表號，支援手機一鍵直接撥打與斷網離線查詢。",
    scientificBasis: [
      {
        title: "公眾電信網路號碼計畫與特殊服務號碼核配管理",
        authority: "數位發展部 / 國家通訊傳播委員會 (NCC)",
        url: "https://www.moda.gov.tw/",
      },
      {
        title: "重大災害緊急報案與防救災緊急通訊作業規定",
        authority: "內政部消防署 / 內政部警政署",
        url: "https://www.nfa.gov.tw/",
      },
    ],
    relatedSlugs: ["er-status", "aed", "disaster-map", "weather-alerts", "travel-epidemic-alerts", "anti-fraud", "social-welfare-centers"],
    faqs: [
      {
        question: "手機在沒有 SIM 卡或沒有所屬電信訊號時該如何求救？",
        answer:
          "請直接撥打 112。112 是全球通用行動電話緊急救難專線，只要周遭有任一家電信業者的基地台訊號，手機即可跨網接通。撥通後依語音導引按 0 轉接 110 警察局，或按 9 轉接 119 消防局。",
      },
      {
        question: "用手機撥打 1999 和用市話撥打有何不同？",
        answer:
          "市話撥打 1999 會精準轉接至發話地之縣市政府，且多數縣市享有前數分鐘通話免費補貼；手機撥打 1999 則可能因跨基地台涵蓋而誤轉鄰近縣市，且通話費依個人行動資費計收。若人在外縣市想洽詢特定縣市政務，建議直接撥打該縣市的專用市話代表號（如臺北市撥 02-2720-8889）。",
      },
      {
        question: "聽語障人士如何向 110 或 119 緊急報案？",
        answer:
          "警政署與消防署設有聽語障專用簡訊報案專線：警察報案請傳送簡訊至 0911-511-110；消防救災救護請傳送簡訊至 0911-511-119，亦可利用 119 報案 App 之定位及文字點選報案功能。",
      },
      {
        question: "1925、1980 與 1995 心理輔導專線有何差別？",
        answer:
          "1925 是衛福部 24 小時免付費安心專線，專注於情緒困擾與自殺危機干預；1980 是救國團張老師專線，專門提供青少年成長、課業、親子與人際困擾輔導；1995 則是生命線協談專線，提供 24 小時人生低潮與家庭情感傾聽支持。",
      },
    ],
  },
  {
    slug: "anti-fraud",
    group: "disaster-alerts",
    lastUpdated: "2026-10-14",

    schemaType: "WebPage",
    title: "防詐騙查詢：可疑網址涉詐網域比對",
    keywords: ["詐騙", "可疑網址", "165", "涉詐網域", "網域查詢", "防詐騙"],
    navLabel: "防詐騙查詢",
    description:
      "貼上收到的可疑網址或網域，比對內政部警政署每月公布之遭停止解析涉詐網站清單、數位發展部近乎每日更新之詐騙網域停止解析清單，查詢是否已被認定涉詐並停止解析，並分別顯示各來源的網站性質或說明與停止解析時間。",
    directAnswer:
      "防詐騙查詢比對內政部警政署每月、數位發展部近乎每日公布的涉詐網域清單，貼上可疑網址即可知道是否已被列為涉詐並停止解析；清單上沒有不代表安全，有疑慮請撥165查證。",
    scientificBasis: [
      {
        title: "內政部警政署「165反詐騙諮詢專線_遭停止解析涉詐網站」開放資料",
        authority: "內政部警政署",
        url: "https://data.gov.tw/dataset/176455",
      },
      {
        title: "數位發展部「詐騙網域停止解析清單」開放資料",
        authority: "數位發展部",
        url: "https://data.gov.tw/dataset/165027",
      },
      {
        title: "內政部警政署「假投資（博弈）網站」開放資料（歷史資料，已停更）",
        authority: "內政部警政署",
        url: "https://data.gov.tw/dataset/160055",
      },
      {
        title: "165全民防騙網",
        authority: "內政部警政署刑事警察局",
        url: "https://165.npa.gov.tw/",
      },
    ],
    relatedSlugs: ["emergency-hotlines"],
    faqs: [
      {
        question: "查詢結果顯示「不在清單上」，代表這個網址一定安全嗎？",
        answer:
          "不代表安全。涉詐網域清單是警政署接獲檢舉或查證後才公告，每月更新一批，新出現的詐騙網站可能還沒被列入。不在清單上只代表「目前還沒被公告」，如仍有疑慮，請撥打165反詐騙諮詢專線查證，切勿因查無結果而放心點擊、提供個資或匯款。",
      },
      {
        question: "查到的網址已被列為涉詐，我該怎麼做？",
        answer:
          "請立即關閉頁面，不要點擊連結、不要提供個人資料或銀行帳戶資訊，更不要依指示匯款或轉帳。如已經匯款或提供資料，請立刻撥打165反詐騙諮詢專線或110報案，並聯繫銀行申請圈存止扣，同時保留對話紀錄與交易明細作為證據。",
      },
      {
        question: "為什麼查詢子網域（例如 login.某網域.com）也會比對出結果？",
        answer:
          "詐騙集團常把同一個惡意網域架設在不同子網域下作案。本工具會從完整網址開始，依序往上層網域比對，只要上層的主網域已被警政署列入清單，底下的子網域也會顯示為已比中，避免被換個子網域就繞過查詢。但比對會在遇到公共網域後綴或 Shopify、Netlify 等共享平台網域時停止，不會因為平台本身被誤判，就把平台上所有商店都當成詐騙。",
      },
      {
        question: "這個工具會不會記錄我查過的網址？",
        answer:
          "不會。查詢模組本身不寫入任何記錄檔，也不會把查詢內容存進資料庫；伺服器端也不會把您輸入的網址寫進任何紀錄或錯誤訊息。",
      },
    ],
  },
  {
    slug: "emergency-supplies",
    group: "disaster-alerts",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    title: "全民防災物資：緊急避難包與居家儲備計算機",
    keywords: ["防災包", "緊急避難包", "居家儲備物資"],
    navLabel: "防災避難物資計算",
    description:
      "依據國防部《臺灣全民安全指引》與內政部消防署規範，提供個人緊急避難包 (Go-Bag) 互動檢核清單，並依家庭人數與儲備天數（3/7/14天）動態推算生活飲水、乾糧熱量、常備藥品與特殊備品，支援離線暫存與列印。",
    directAnswer:
      "全民防災物資包含「個人隨身緊急避難包（1人1包，重物在上輕物在下，不超過體重15%）」與「家庭日常居家儲備（以每人每天3公升飲用水、3天以上耐保存高熱量食物、常備藥品、照明通信為基礎）」，可依家庭人數精算所需物資。",
    formula:
      "總飲用水量 (L) = (成人 + 孩童 + 長者 + 嬰兒) × 天數 × 3L + (毛孩 × 天數 × 0.6L)；乾糧主食總餐數 = (成人 + 孩童 + 長者) × 天數 × 3 餐",
    scientificBasis: [
      {
        title: "《當危機來臨時 - 臺灣全民安全指引》物資準備規範",
        authority: "國防部全民防衛動員署",
        url: "https://prepare.mnd.gov.tw/",
      },
      {
        title: "緊急避難包準備檢核指引與家庭防災計畫",
        authority: "內政部消防署",
        url: "https://www.nfa.gov.tw/",
      },
      {
        title: "全民國防手冊與平時應變整備作業",
        authority: "行政院災害防救辦公室",
        url: "https://www.ey.gov.tw/",
      },
    ],
    referenceTable: {
      title: "國防部全民安全指引：個人避難包 vs 居家儲備對照表",
      headers: ["類別", "個人緊急避難包 (Go-Bag)", "家庭日常居家儲備 (Household)"],
      rows: [
        [
          "使用情境",
          "接獲疏散避難通知、房屋受損需立即撤離時隨身攜帶",
          "遭遇地震、風災、停水停電或需在家固守避難時使用",
        ],
        [
          "準備原則",
          "1 人 1 包，放置於大門玄關或隨手可取之處，重量 ≤ 體重 15%",
          "以家戶為單位集中存放於陰涼乾燥處，每半年定期盤點更新",
        ],
        [
          "飲水規劃",
          "每人隨身約 1 ~ 1.5 公升瓶裝水，避免過重影響行動",
          "每人每天 3 公升（成人飲用加基礎衛生），儲備 3 至 14 天",
        ],
        [
          "食物規劃",
          "高熱量、耐存放、免烹煮（巧克力、能量棒、營養餅乾）",
          "易保存乾糧、罐頭、真空米麵、即食自熱飯、長效保久乳",
        ],
        [
          "醫藥照護",
          "個人隨身慢性病藥品（3-7天）、個人急救包、止血帶",
          "慢性病常備處方（7-14天）、綜合常備藥品箱、退燒止痛",
        ],
        [
          "照明通訊",
          "強光 LED 手電筒、高分貝求救哨、充飽電之行動電源",
          "手搖/電池防災收音機、多功能卡式爐與瓦斯罐、備用電池",
        ],
      ],
    },
    relatedSlugs: ["emergency-hotlines", "disaster-map", "earthquakes", "water-outages"],
    faqs: [
      {
        question: "緊急避難包應該放在哪裡？多重才合適？",
        answer:
          "國防部與消防署建議將緊急避難包放在大門口、玄關或床頭等隨手可拿取處。背包重量以不超過個人體重的 15% 為原則（例如 60 公斤成人背包建議不超過 9 公斤），且重物應置於背包中上方貼近背部，背負時重心更穩定且節省體力。",
      },
      {
        question: "居家儲備水為什麼需要每人每天 3 公升？",
        answer:
          "一般健康成人每日維持基本生理代謝需約 2 公升飲用水，在災害應變、高溫或精神緊繃狀態下水分散失加快；額外的 1 公升則用於基本傷口沖洗、漱口或簡易衛生處理。若家中有長者、病患或活動量大的孩童，建議依人數上修。",
      },
      {
        question: "避難包多久需要檢查更新一次？",
        answer:
          "建議每半年固定檢查一次（例如設定於每年 3 月與 9 月的防震防災月，或特定節日如 921 國家防災日）。檢查重點包含：食品與瓶裝水保存期限、個人常備藥物有效期限、手電筒與行動電源是否自放電需重新充電、替換衣物尺寸是否合適（特別是成長中的孩童）。",
      },
      {
        question: "有嬰幼兒或毛孩的家庭，需要特別儲備什麼？",
        answer:
          "有嬰兒的家庭必備配方奶粉（建議小包裝防潮）、乾淨奶瓶、純水濕紙巾、足量尿布與背巾；有毛孩的家庭需準備至少 7 天份的乾糧或主食罐、專用水、便袋/貓砂、折疊碗、牽繩防護箱與寵物晶片狂犬病疫苗證明影本。",
      },
      {
        question: "國防部推薦的防災 App 有哪些？",
        answer:
          "國防部全民安全指引重點推薦下載兩大官方 App：「消防防災 e 點通」（由內政部消防署維護，可查詢避難收容處所、急救站與即時天災警報）與「警政服務」（由內政部警政署維護，可一鍵查詢身邊最近的防空避難設施定位）。",
      },
    ],
  },
  {
    slug: "medical-violators",
    group: "medical-care",
    lastUpdated: "2026-10-12",

    title: "醫事人員性別事件查詢（狼醫專區）",
    keywords: ["狼醫", "醫事性平事件", "醫師性騷擾"],
    navLabel: "醫事性平查詢",
    description:
      "即時查詢衛生福利部官方公告經法院確定判決或醫事審議懲戒之涉及性平事件醫事人員名冊（涵蓋醫師、中醫師、放射師、藥事及護理人員），落實就醫安全與病患防護知情權。",
    directAnswer:
      "衛福部「醫事人員性別事件資訊專區」（狼醫平台）彙整性平三法修法後判決確定之違法醫事人員名單，揭露姓名、類別、專科、執業縣市與裁判/懲戒處分書，供民眾就醫前主動查驗。",
    scientificBasis: [
      {
        title: "醫事人員性別事件資訊專區",
        authority: "衛生福利部醫事司",
        url: "https://ma.mohw.gov.tw/Accessibility/VIOSearch/MASearchVIO",
      },
      {
        title: "司法院法學資料檢索系統（裁判書查詢）",
        authority: "司法院",
        url: "https://judgment.judicial.gov.tw",
      },
      {
        title: "性別平等工作法與性騷擾防治法（性平三法）",
        authority: "全國法規資料庫",
        url: "https://law.moj.gov.tw",
      },
    ],
    referenceTable: {
      title: "衛福部醫事人員性別事件專區查核指引與法律依據",
      headers: ["查核項目", "收錄標準", "法規依據", "資料更新與歷審裁判確認"],
      rows: [
        [
          "收錄對象",
          "經法院判決或醫事審議懲戒確定之醫事人員",
          "個人資料保護法第 16 條第 2 款（公益必要）",
          "目前以 112 年性平三法修正迄今確定判決為主",
        ],
        [
          "涵蓋專業類別",
          "醫師、中醫師、牙醫師、藥師、放射師、護理師等 18 類",
          "各類醫事人員法規（醫師法、護理人員法等）",
          "依司法院判決書介接與衛福部定期審議更新",
        ],
        [
          "執業狀態標註",
          "執業中、歇業、已廢止執業執照/證書",
          "各縣市衛生局醫事人員執業登錄系統",
          "動態異動由地方主管機關公報即時核定",
        ],
      ],
    },
    relatedSlugs: ["clinics", "baby-friendly-hospitals", "adult-preventive-care", "long-term-care"],
    faqs: [
      {
        question: "衛福部「狼醫查詢平台」的法源依據與資料範圍為何？",
        answer:
          "本專區依據個人資料保護法第 16 條但書第 2 款「增進公共利益所必要」規定公開。現階段以 112 年性平三法修正迄今，經司法院刑事或行政訴訟裁判確定，或經地方衛生局醫懲會決議廢證或停業之案件為主。",
      },
      {
        question: "如何確認案件是否已經三審判決確定？",
        answer:
          "專區所載案件均附有案號或裁判字號連結，民眾可點擊直達司法院裁判書系統，依據「歷審裁判」欄位核實最新審級（如最高法院駁回上訴確定、高等法院判決定讞等）。",
      },
      {
        question: "為什麼部分醫師的名單中沒有列出具體執業診所名稱？",
        answer:
          "衛福部說明，醫師與醫事人員之執業機構屬於動態登記，醫師可能隨時於不同院所間支援、歇業或異動，為避免登記時間落差造成資訊誤導，現行平台以「執業縣市」與「證書字號」作為主要識別基準。",
      },
      {
        question: "若發現就診醫師曾涉及性平事件，病患有哪些自保權益？",
        answer:
          "病患享有醫療選擇權與身體自主權。在侵入性檢查、婦產科、泌尿科、超音波或物理治療時，有權要求醫療院所安排護理人員陪同（Chaperone），或選擇更換看診醫師。若遇不當對待，應立即向院方申訴或撥打 113 保護專線、向當地衛生局檢舉。",
      },
    ],
  },
  {
    slug: "senior-friendly",
    group: "elder-care-welfare",
    lastUpdated: "2026-10-12",

    schemaType: "WebPage",
    navLabel: "敬老卡與樂齡旅遊地圖",
    title: "敬老卡補助與樂齡旅遊地圖：全臺22縣市敬老卡交通補助查詢",
    keywords: ["敬老卡", "敬老卡補助", "樂齡旅遊"],
    description:
      "查詢全臺 22 縣市敬老卡交通補助類型與申請資訊，並整合景區無障礙設施、軟性服務（輪椅／老花眼鏡借用、語音導覽）、樂齡套票推薦與設施停用公告。",
    directAnswer:
      "敬老卡補助與樂齡旅遊地圖整合交通部 TDX「樂齡/敬老」觀光開放資料與全臺 22 縣市社會局敬老卡資訊：選擇縣市即可查詢敬老卡交通補助類型與申請連結，並搜尋全臺景區的無障礙設施、軟性服務與樂齡套票推薦。",
    scientificBasis: [
      {
        title: "交通部運輸資料流通服務 (TDX)「樂齡/敬老」觀光無障礙與敬老卡開放資料",
        authority: "交通部",
        url: "https://tdx.transportdata.tw",
      },
      {
        title: "各縣市政府社會局（處）敬老福利政策",
        authority: "衛生福利部社會及家庭署 (SFAA)",
        url: "https://www.sfaa.gov.tw",
      },
    ],
    relatedSlugs: ["accessible-transit", "long-term-care", "funeral-facilities"],
    faqs: [
      {
        question: "敬老卡申請資格是什麼？",
        answer:
          "一般需設籍該縣市且年滿 65 歲以上；部分縣市放寬原住民申請年齡至 55 歲以上。各縣市補助額度、是否需定期儲值與涵蓋運具範圍略有不同，請以當地社會局（處）最新公告為準，或撥打衛福部 1957 福利諮詢專線查詢。",
      },
      {
        question: "樂齡套票與一般旅遊行程有什麼不同？",
        answer:
          "樂齡套票是觀光署或各業者針對長輩設計的旅遊行程，特色是行程節奏較慢、住宿與交通安排考量長輩體力與無障礙需求，部分套票並結合景區無障礙設施與軟性服務（如輪椅、老花眼鏡借用）資訊，方便長輩安心出遊。",
      },
      {
        question: "景區設施停用公告會顯示多久？",
        answer:
          "公告僅在生效期間（開始時間至結束時間內）顯示，一旦超過結束時間即自動隱藏，避免長輩看到已經恢復使用的過期資訊；若公告未標示結束時間，則視為持續有效直到另行公告。",
      },
    ],
  },
  {
    slug: "social-welfare-centers",
    group: "elder-care-welfare",
    lastUpdated: "2026-10-14",

    title: "社福中心與社工求助",
    keywords: ["社福中心", "社工", "社工訪視", "113", "1957", "家暴通報", "兒虐通報", "未成年懷孕", "社會救助", "獨居長輩關懷", "快速離開"],
    description:
      "依服務轄區查詢全國約 158 處社福中心的地址與電話；依經濟困難、照顧壓力、懷疑家暴兒虐、獨居長輩、未成年懷孕等情境，列出建議的求助專線與線上通報管道，並說明社工到府訪視的流程。頁面附快速離開按鈕（可按 Escape 鍵），且不會把任何選擇或查詢內容寫入本機儲存。",
    directAnswer:
      "社福中心與社工求助依服務轄區查詢全國社福中心（地址、電話），並依 5 種常見情境（經濟困難、照顧壓力、懷疑家暴兒虐、獨居長輩、未成年懷孕）列出對應的求助專線（113、1957、1966、0800-25-7085）與線上通報連結；頁面提供快速離開按鈕保護可能被同住者查看裝置的求助者。",
    scientificBasis: [
      {
        title: "全國社福中心福利服務中心通訊錄",
        authority: "衛生福利部社會及家庭署 (SFAA)",
        url: "https://data.gov.tw/dataset/160903",
      },
      {
        title: "關懷e起來（保護性案件線上通報）",
        authority: "衛生福利部",
        url: "https://ecare.mohw.gov.tw/",
      },
      {
        title: "全國未成年懷孕求助資源網",
        authority: "衛生福利部社會及家庭署 (SFAA)",
        url: "https://257085.sfaa.gov.tw/",
      },
    ],
    relatedSlugs: ["emergency-hotlines", "long-term-care", "disability-welfare"],
    faqs: [
      {
        question: "我不確定自己的狀況算不算「需要找社工」，可以先打電話問問看嗎？",
        answer:
          "可以。1957 福利諮詢專線（免付費，每日 08:00-22:00）就是設計給還不確定該找誰、只是想先問問看的人，專人會依您描述的狀況轉介適合的資源，不需要先確定「符不符合資格」才打。",
      },
      {
        question: "查到的社福中心地址不在我住的鄉鎮市區，還可以找它嗎？",
        answer:
          "可以。社福中心的「服務轄區」通常涵蓋好幾個鄉鎮市區，不是只服務它辦公室所在的那一個行政區——例如新北市一處社福中心可能辦公室設在新莊區，但服務轄區包含泰山、林口、五股。查詢結果會顯示每個中心的「服務轄區」，請以服務轄區是否涵蓋您的住處為準，不是以辦公室地址為準。",
      },
      {
        question: "我擔心同住的人看到我瀏覽過這個頁面，怎麼辦？",
        answer:
          "頁面右上角有固定顯示的「快速離開」按鈕，點擊或按 Escape 鍵會立即跳到與本頁無關的中性網站，且用瀏覽器「上一頁」無法回到本頁。本頁也不會把您選過的情境或查詢內容寫入手機、電腦的任何本機儲存。如果仍擔心瀏覽紀錄本身被看到，建議瀏覽後手動清除瀏覽器紀錄，或改用無痕視窗、公共場所的裝置查詢。",
      },
      {
        question: "社工會不會因為我打電話求助就直接把我的孩子帶走，或強制安置長輩？",
        answer:
          "不會。社工到府的第一步是評估家庭目前的狀況與需求，大多數情況的目標是協助申請補助、轉介資源或安排後續追蹤，不是立即安置。只有在評估後確認有立即且重大的安全風險時，才會依法採取保護性安置等強制措施，且這類決定需要依法定程序處理，不是社工個人隨意決定。",
      },
    ],
  },
];

/**
 * The docs/archive/SPECIFICATION.md 5.1 collation rule, in one place.
 *
 * It was previously retyped at seven call sites (here plus every SiteFooter
 * column), which is how the footer's English rendering ended up sorted by the
 * Traditional Chinese title. Callers that display localized titles should pass
 * the localized string, not `tool.title`.
 */
export const compareToolTitles = (a: string, b: string): number =>
  a.localeCompare(b, "zh-Hant", { numeric: true });

// Sort TOOL_CATALOG globally by first character using Traditional Chinese localeCompare
TOOL_CATALOG.sort((a, b) => compareToolTitles(a.title, b.title));

/**
 * Every tool in one group, collated per the navbar/footer stroke-order rule
 * (see `compareByStrokeOrder`).
 *
 * `label` defaults to the catalog title; pass a localizer to sort by what the
 * reader actually sees (and to sort by `navLabel` when present — callers that
 * drive Nav/Footer should pass `(tool) => tool.navLabel ?? tool.title`).
 */
/**
 * Whether a tool page should appear in the sitemap.
 *
 * Most tools are thin search shells over an external open-data registry
 * (facility/institution rosters, product/business registries) — not
 * indexable content in their own right — versus a smaller set of tools that
 * are genuinely substantive, frequently-changing content (health calculators,
 * real-time environmental/disaster monitoring). This used to be derivable
 * from `group` alone (`"calculator"` and the old `"weather"` group), but
 * issue #256's reclassification mixes indexable and non-indexable tools
 * within the same new group (e.g. "environment" holds both `aqi`, a
 * real-time monitoring page, and `iaq-premises`, a thin premises registry).
 * So indexability is now tracked directly as an explicit slug allowlist,
 * decoupled from whatever `group` a tool happens to sit in.
 *
 * The allowlist preserves each tool's PRE-#256 indexability except
 * `green-certifications`: three of its four merged sources (green-hotels,
 * green-products, green-restaurants) were already indexed and only
 * green-shops was not, and the merged page is a substantially richer,
 * single canonical comparison across all four certification types — not a
 * thin single-type shell — so it is indexed (a net SEO improvement for the
 * green-shops content, not a demotion for the other three).
 */
const INDEXABLE_SLUGS = new Set([
  // "calculator" group — every tool in it is indexable.
  "bmi",
  "calories",
  "nutrition",
  "water",
  "body-fat",
  "waist-hip",
  "heart-rate",
  "blood-pressure",
  "sleep",
  "stress",
  "lbm",
  "vo2max",
  // Formerly the "weather" group's substantive, frequently-updated content.
  "uv",
  "earthquakes",
  "aqi",
  "weather-alerts",
  "aqx-monitoring",
  "water-conditions",
  "green-certifications",
  // Real content that happens to share a group with registry-lookup pages.
  "disaster-map",
  "er-status",
  "aed",
  "food-safety",
  "outdoor-safety",
  "accessible-transit",
  "senior-friendly",
  "inundation-map",
  "water-outages",
  "emergency-hotlines",
  "emergency-supplies",
  "medical-violators",
]);

export const isToolIndexable = (tool: ToolCatalogEntry): boolean =>
  INDEXABLE_SLUGS.has(tool.slug);

export function toolsInGroup(
  group: ToolGroup,
  label: (tool: ToolCatalogEntry) => string = (tool) => tool.title,
  locale?: string,
): ToolCatalogEntry[] {
  return TOOL_CATALOG.filter((tool) => tool.group === group).sort((a, b) =>
    compareByStrokeOrder(label(a), label(b), locale),
  );
}

/** Look up a tool's catalog entry by slug — throws if missing so a typo'd slug fails
 * loudly at build/request time instead of silently rendering blank title/description. */
export function getToolCatalogEntry(slug: string): ToolCatalogEntry {
  const normalizedSlug =
    slug === "tax-organizations" ? "npo-organizations" : slug;
  const entry = TOOL_CATALOG.find((tool) => tool.slug === normalizedSlug);
  if (!entry) {
    throw new Error(`No TOOL_CATALOG entry for slug "${slug}"`);
  }
  return entry;
}

/**
 * Find every catalog entry matching a free-text keyword (issue #441).
 *
 * A pure function — given the same `query` (and the same `translate` callback,
 * if provided) it always returns the same result, with no side effects and no
 * network calls — so it is the shared foundation for three things that all
 * need "does this keyword match a tool" without a server round-trip: the
 * Ctrl+K search-across-tools UI, news↔tool cross-linking, and each tool
 * page's `llms.txt` keywords.
 *
 * Matches case-insensitively (so "AED" / "aed" are equivalent) against:
 *  - `title`
 *  - `description`
 *  - `directAnswer`
 *  - every entry in `keywords` (common nicknames/synonyms, e.g. AED ↔ 心臟電擊)
 *  - the current locale's translated label, when `translate` is passed —
 *    callers in a locale other than zh-TW should pass e.g.
 *    `(tool) => t(\`catalog.${tool.slug}\`, tool.title)` so a search for an
 *    English/Japanese/Korean term still finds the tool.
 *
 * An empty/whitespace-only query returns no results rather than the whole
 * catalog, since callers wire this to "type to search" UIs where no input
 * means no results yet.
 */
export function searchTools(
  query: string,
  translate?: (tool: ToolCatalogEntry) => string | null | undefined,
): ToolCatalogEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-TW");
  if (!normalizedQuery) {
    return [];
  }

  return TOOL_CATALOG.filter((tool) => {
    const haystacks: Array<string | null | undefined> = [
      tool.title,
      tool.description,
      tool.directAnswer,
      ...tool.keywords,
      translate?.(tool),
    ];
    return haystacks.some(
      (text) =>
        typeof text === "string" &&
        text.toLocaleLowerCase("zh-TW").includes(normalizedQuery),
    );
  });
}
