import { compareByStrokeOrder } from "./strokeOrder";

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
  | "calculator"
  | "care-facility"
  | "registry"
  | "child-welfare"
  | "disaster-safety"
  | "transport-energy"
  | "environment"
  | "culture-tourism"
  | "life-services";

export interface ToolGroupMeta {
  group: ToolGroup;
  /** i18n dictionary key (locales/{zh-TW,en}.json → nav.*) for this category's label. */
  labelKey: string;
  /** Traditional Chinese default, used when a translation is missing and as
   * the source string for `compareByStrokeOrder`'s category ordering. */
  labelDefault: string;
}

/**
 * Single source of truth for the 9 Nav-dropdown / Footer-column / /tools
 * category buckets (issue #256 reclassification) — SiteNav.tsx and
 * SiteFooter.tsx both derive their category list from this array instead of
 * each hand-rolling their own, so the two can't drift out of sync the way
 * the old 7-bucket layout was hardcoded independently in both files.
 */
export const TOOL_GROUP_META: ToolGroupMeta[] = [
  { group: "calculator", labelKey: "nav.healthTools", labelDefault: "健康工具" },
  { group: "care-facility", labelKey: "nav.careFacility", labelDefault: "醫療照護機構" },
  { group: "registry", labelKey: "nav.registry", labelDefault: "藥品食品登錄查詢" },
  { group: "child-welfare", labelKey: "nav.childWelfare", labelDefault: "兒少福利與教育" },
  { group: "disaster-safety", labelKey: "nav.disasterSafety", labelDefault: "防災與安全示警" },
  { group: "transport-energy", labelKey: "nav.transportEnergy", labelDefault: "交通與能源" },
  { group: "environment", labelKey: "nav.environment", labelDefault: "環境品質與綠色生活" },
  { group: "culture-tourism", labelKey: "nav.cultureTourism", labelDefault: "文化藝術與觀光" },
  { group: "life-services", labelKey: "nav.lifeServices", labelDefault: "公益與生活服務" },
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
   * from one place (issue #256 reclassification): "calculator" → 健康工具;
   * "care-facility" → 醫療照護機構; "registry" → 藥品食品登錄查詢;
   * "child-welfare" → 兒少福利與教育; "disaster-safety" → 防災與安全示警;
   * "transport-energy" → 交通與能源; "environment" → 環境品質與綠色生活;
   * "culture-tourism" → 文化藝術與觀光; "life-services" → 公益與生活服務. */
  group: ToolGroup;
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
}

// Single source of truth for "what tools does this site have" — used by
// llms.txt (app/llms.txt/route.ts), sitemap.ts, and ToolPageShell (which
// derives each page's WebApplication/MedicalWebPage/FAQPage structured data
// automatically by slug), so all stay in sync without duplicating text.
export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    slug: "uv",
    group: "disaster-safety",
    title: "全臺即時紫外線指數 (UV)",
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
    group: "disaster-safety",
    schemaType: "WebPage",
    title: "臺灣與全球顯著地震查詢",
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
    relatedSlugs: ["uv", "aqi"],
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
    group: "calculator",
    title: "BMI 計算器",
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
    group: "calculator",
    title: "卡路里需求計算器",
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
    group: "calculator",
    title: "每日營養素建議計算器",
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
    relatedSlugs: ["calories", "food-nutrition", "bmi", "body-fat"],
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
    group: "calculator",
    title: "飲水量計算器",
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
    group: "calculator",
    title: "體脂率計算器",
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
    group: "calculator",
    title: "腰臀比計算器",
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
    group: "calculator",
    title: "目標心率計算器",
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
    group: "calculator",
    title: "血壓分析器",
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
    group: "calculator",
    title: "睡眠品質評估",
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
    relatedSlugs: ["stress", "heart-rate", "blood-pressure"],
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
    group: "calculator",
    title: "壓力評估測驗",
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
    relatedSlugs: ["sleep", "heart-rate", "blood-pressure"],
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
    group: "calculator",
    title: "去脂體重 (LBM) 計算器",
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
    group: "calculator",
    title: "VO2Max 估算器",
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
    group: "environment",
    title: "AQI 空氣品質即時查詢",
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
    relatedSlugs: ["uv", "earthquakes", "water"],
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
    group: "care-facility",
    title: "醫療院所查詢",
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
    relatedSlugs: ["pharmacies", "home-healthcare", "health-checks"],
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
    group: "care-facility",
    title: "藥局查詢",
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
    relatedSlugs: ["clinics", "drugs", "home-healthcare"],
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
    group: "registry",
    title: "藥品查詢",
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
    group: "registry",
    title: "食品營養成分查詢",
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
    relatedSlugs: ["calories", "nutrition", "food-operators"],
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
    group: "registry",
    schemaType: "WebPage",
    title: "食品業者登錄查詢",
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
    group: "care-facility",
    title: "健康檢查機構查詢",
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
    relatedSlugs: ["clinics", "home-healthcare", "blood-pressure"],
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
    group: "care-facility",
    title: "長照服務機構查詢",
    description:
      "查詢全臺長照服務機構與長照2.0特約機構，涵蓋居家服務、日間照顧、喘息服務、住宿型長照機構與社區照顧據點。支援關鍵字搜尋與附近定位。",
    directAnswer:
      "長照服務機構查詢整合衛福部長照2.0特約服務單位與長期照顧服務機構名冊，涵蓋居家照顧、日間照顧、住宿式機構、喘息服務與社區據點，提供即時定位與多維度服務篩選。",
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
    ],
    relatedSlugs: ["elder-welfare", "home-healthcare", "disability-welfare"],
    faqs: [
      {
        question: "資料涵蓋哪些長照機構與服務項目？",
        answer:
          "收錄衛福部許可之全臺長期照顧服務機構與長照2.0特約機構，涵蓋居家服務、日間照顧、喘息服務、家庭托顧、住宿式長照機構及社區巷弄長照站等完整資源。",
      },
    ],
  },
  {
    slug: "home-healthcare",
    group: "care-facility",
    title: "居家醫療查詢",
    description:
      "查詢提供居家醫療照護服務的全民健保特約機構，支援關鍵字搜尋與附近定位。",
    directAnswer:
      "查詢全民健保居家醫療照護整合計畫特約醫事機構，提供行動不便長者與重症病患到宅醫療照護服務資訊。",
    scientificBasis: [
      {
        title: "全民健康保險居家醫療照護整合計畫特約名冊",
        authority: "衛生福利部中央健康保險署 (NHI)",
        url: "https://www.nhi.gov.tw",
      },
    ],
    relatedSlugs: ["clinics", "ltc-contracted", "long-term-care"],
    faqs: [
      {
        question: "居家醫療服務包含哪些內容？",
        answer:
          "居家醫療是由健保特約醫事機構到宅提供的醫療照護服務，適用於行動不便、有醫療照護需求但難以親自就醫的民眾，實際服務項目依機構而定。",
      },
    ],
  },
  {
    slug: "disability-welfare",
    group: "care-facility",
    title: "身心障礙福利機構查詢",
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
    relatedSlugs: ["disability-atm", "elder-welfare", "child-welfare-institutions"],
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
    group: "life-services",
    navLabel: "無障礙ATM查詢",
    title: "信用合作社無障礙ATM查詢",
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
    relatedSlugs: ["disability-welfare", "hakka-bogong"],
    faqs: [
      {
        question: "資料涵蓋哪些無障礙ATM？",
        answer:
          "資料來源為中華民國信用合作社聯合社的輪椅可及ATM與語音服務ATM名冊，兩份名單依信用合作社分社代號合併，同一分社若同時提供兩種服務會標示為「輪椅可及、語音服務」。",
      },
    ],
  },
  {
    slug: "elder-welfare",
    group: "care-facility",
    title: "老人福利機構查詢",
    description: "查詢衛福部全國老人福利機構名冊，支援關鍵字搜尋與附近定位。",
    directAnswer:
      "查詢衛福部全國老人福利機構名冊，涵蓋公私立安養中心、養護機構與長期照護機構。",
    scientificBasis: [
      {
        title: "全國老人福利機構一覽表",
        authority: "衛生福利部社會及家庭署 (SFAA)",
        url: "https://www.sfaa.gov.tw",
      },
    ],
    relatedSlugs: ["long-term-care", "ltc-contracted", "disability-welfare"],
    faqs: [
      {
        question: "資料涵蓋哪些老人福利機構？",
        answer:
          "資料來源為衛福部社會及家庭署開放資料「全國老人福利機構名冊」，涵蓋安養、養護、長期照顧等各類老人福利機構，資料按縣市分別提供。",
      },
    ],
  },
  {
    slug: "hakka-bogong",
    group: "care-facility",
    title: "客家委員會「伯公照護站」查詢",
    description:
      "查詢客家委員會「伯公照護站」名冊，支援關鍵字搜尋與附近定位。",
    directAnswer:
      "查詢客家委員會核准設立之伯公照護站名冊，提供客庄長者客語溝通、文化傳承、健康促進與長照關懷據點資訊。",
    scientificBasis: [
      {
        title: "客家委員會開放資料 - 伯公照護站名冊",
        authority: "客家委員會 (HAC)",
        url: "https://cloud.hakka.gov.tw/Pub/Opendata/DTST20230600002.json",
      },
    ],
    relatedSlugs: ["ltc-contracted", "elder-welfare"],
    faqs: [
      {
        question: "什麼是「伯公照護站」？提供哪些服務？",
        answer:
          "「伯公照護站」為客家委員會配合衛生福利部長照 2.0 政策，結合客庄在地資源（如社區發展協會、C 級巷弄長照站）推動之據點。除了提供共餐、關懷訪視與延緩失能課程外，特別融入客語環境、客家歌謠與文化健康活動，提供貼近客庄長者生活背景的在地照顧。",
      },
    ],
  },
  {
    slug: "public-toilets",
    group: "life-services",
    schemaType: "WebPage",
    title: "全國公廁查詢",
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
    relatedSlugs: ["green-certifications", "disability-atm"],
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
    group: "child-welfare",
    title: "全國親子館與兒少福利中心查詢",
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
    group: "child-welfare",
    schemaType: "WebPage",
    title: "全國幼兒園查詢",
    description:
      "查詢全國公立、私立、準公共與非營利幼兒園名錄，提供核定招收人數、設立許可、地址電話與地圖導航。資料來源：教育部開放資料。",
    directAnswer:
      "查詢全國公私立幼兒園名錄，涵蓋幼兒園設立別、核定人數、電話與所在地址。",
    scientificBasis: [
      {
        title: "全國幼兒園名錄 (k1_new.json)",
        authority: "教育部統計處 (MOE)",
        url: "https://stats.moe.gov.tw",
      },
    ],
    relatedSlugs: ["cram-schools", "child-welfare-institutions"],
    faqs: [
      {
        question: "如何查詢附近的公立或私立幼兒園？",
        answer:
          "開啟定位或在搜尋框輸入縣市與幼兒園名稱，可依公立、私立、非營利進行篩選並在地圖上查看位置。",
      },
      {
        question: "資料來源與更新頻率？",
        answer: "資料來源為教育部統計處公開之全國幼兒園名錄開放資料。",
      },
    ],
  },
  {
    slug: "cram-schools",
    group: "child-welfare",
    schemaType: "WebPage",
    title: "全國短期補習班查詢",
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
    relatedSlugs: ["kindergartens", "child-welfare-institutions", "child-safety-spots"],
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
    slug: "child-safety-spots",
    group: "disaster-safety",
    schemaType: "WebPage",
    title: "婦幼安全警示地點查詢",
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
    group: "child-welfare",
    schemaType: "WebPage",
    navLabel: "本土語言辭典",
    title: "兒少本土語言辭典（閩南語／客語）",
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
    group: "life-services",
    schemaType: "WebPage",
    title: "全臺公益組織(NPO)查詢",
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
    relatedSlugs: ["food-operators", "green-certifications", "child-welfare-institutions", "disability-welfare"],
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
    group: "culture-tourism",
    schemaType: "WebPage",
    title: "全國藝文展覽與親子活動查詢",
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
    relatedSlugs: ["public-art", "heritage-map", "latest-books"],
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
    group: "culture-tourism",
    schemaType: "WebPage",
    title: "全國公共藝術與演藝場所地圖",
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
    group: "culture-tourism",
    schemaType: "WebPage",
    navLabel: "文化資產地圖",
    title: "文化資產地圖：古蹟／歷史建築／考古遺址查詢",
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
    group: "disaster-safety",
    title: "國際旅遊疫情與即時情報地圖",
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
    relatedSlugs: ["aqi", "uv", "weather-alerts"],
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
    group: "disaster-safety",
    title: "即時氣象警報與降雨資訊",
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
    relatedSlugs: ["aqi", "uv", "earthquakes", "water"],
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
    group: "life-services",
    title: "全國涼適點查詢",
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
    relatedSlugs: ["uv", "public-toilets", "green-certifications"],
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
    group: "environment",
    schemaType: "WebPage",
    title: "室內空氣品質法公告場所查詢",
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
    group: "environment",
    schemaType: "WebPage",
    title: "地方清潔隊聯絡資訊查詢",
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
    group: "environment",
    schemaType: "WebPage",
    navLabel: "碳足跡查詢",
    title: "碳足跡查詢：產品標籤與排放係數",
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
    group: "environment",
    title: "空氣品質延伸監測資料查詢（AQX 系列）",
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
    group: "environment",
    schemaType: "WebPage",
    navLabel: "全臺水情查詢",
    title: "全臺水情：河川水位與水庫營運查詢",
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
    group: "disaster-safety",
    schemaType: "WebPage",
    navLabel: "防災地圖",
    title: "防災地圖：避難收容處所／消防救援單位／應變中心查詢",
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
    relatedSlugs: ["earthquakes", "weather-alerts"],
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
    slug: "dengue-mosquito-map",
    group: "disaster-safety",
    schemaType: "WebPage",
    navLabel: "登革熱病媒蚊密度地圖",
    title: "登革熱病媒蚊密度地圖：布氏指數(BI)／住宅指數(HI)／容器指數(CI)查詢",
    description:
      "整合衛生福利部疾病管制署「近12個月登革熱病媒蚊調查資料」，於地圖上查詢全臺村里級布氏指數 (BI)、住宅指數 (HI)、容器指數 (CI)、幼蟲指數 (LI) 與成蟲指數 (AI)，並提供官方分級對照說明。",
    directAnswer:
      "登革熱病媒蚊密度地圖整合疾病管制署村里級布氏指數 (BI)、住宅指數 (HI)、容器指數 (CI)、幼蟲指數 (LI) 調查資料，依官方 0-9 級分級呈現病媒蚊密度，級數越高代表登革熱傳播風險越高。",
    formula:
      "布氏指數 (BI) ＝ 陽性容器數 ÷ 調查戶數 × 100；住宅指數 (HI) ＝ 陽性戶數 ÷ 調查戶數 × 100；容器指數 (CI) ＝ 陽性容器數 ÷ 調查容器數 × 100；幼蟲指數 (LI) 為每戶平均病媒蚊幼蟲數之加權密度指數；成蟲指數 (AI) ＝ 雌性成蟲數 ÷ 調查戶數。BI／HI／CI／LI 依數值換算為衛生福利部疾病管制署公告之 0-9 級密度分級（AI 為平均值，官方未另訂分級）。",
    scientificBasis: [
      {
        title: "登革熱病媒蚊指數（定義、計算公式與分級對照表）",
        authority: "衛生福利部疾病管制署 (CDC)",
        url: "https://www.cdc.gov.tw/Category/ListContent/0BhRQWTf3QSkAys2TE_qQg?uaid=BGrMYW2LrvhzFjT5xxgrPw",
      },
      {
        title: "近12個月登革熱病媒蚊調查資料（原始資料集與 Codebook）",
        authority: "衛生福利部疾病管制署 (CDC) 開放資料",
        url: "https://data.gov.tw/dataset/24161",
      },
      {
        title: "登革熱/屈公病防治工作指引",
        authority: "衛生福利部疾病管制署 (CDC)",
        url: "https://www.cdc.gov.tw",
      },
    ],
    referenceTable: {
      title: "登革熱病媒蚊密度指數分級對照表",
      headers: ["級數", "住宅指數 HI (%)", "容器指數 CI (%)", "布氏指數 BI", "幼蟲指數 LI"],
      rows: [
        ["0", "0", "0", "0", "0"],
        ["1", "1 - 3", "1 - 2", "1 - 4", "1 - 3"],
        ["2", "4 - 7", "3 - 5", "5 - 9", "4 - 10"],
        ["3", "8 - 17", "6 - 9", "10 - 19", "11 - 30"],
        ["4", "18 - 28", "10 - 14", "20 - 34", "31 - 100"],
        ["5", "29 - 37", "15 - 20", "35 - 49", "101 - 300"],
        ["6", "38 - 49", "21 - 27", "50 - 74", "301 - 1,000"],
        ["7", "50 - 59", "28 - 31", "75 - 99", "1,001 - 3,000"],
        ["8", "60 - 76", "32 - 40", "100 - 199", "3,001 - 10,000"],
        ["9", "≥ 77", "≥ 41", "≥ 200", "≥ 10,001"],
      ],
    },
    relatedSlugs: ["disaster-map", "weather-alerts", "aqi"],
    faqs: [
      {
        question: "布氏指數(BI)、住宅指數(HI)、容器指數(CI)、幼蟲指數(LI)分別代表什麼？",
        answer:
          "四者皆用來衡量登革熱病媒蚊（埃及斑蚊／白線斑蚊）幼蟲孳生密度：住宅指數 (HI) 是調查住宅中發現幼蟲孳生之陽性戶百分比；容器指數 (CI) 是調查容器中發現幼蟲孳生之陽性容器百分比；布氏指數 (BI) 是每調查 100 戶住宅所發現的陽性容器數；幼蟲指數 (LI) 則是每戶平均幼蟲數的加權密度指數。另有成蟲指數 (AI)，代表平均每戶調查到的雌性病媒蚊成蟲數。",
      },
      {
        question: "指數的 0-9 級分級代表什麼意義？",
        answer:
          "衛生福利部疾病管制署將 HI／CI／BI／LI 各自換算為 0（未發現陽性）至 9 級的密度分級，級數越高代表當地病媒蚊幼蟲孳生越密集，登革熱傳播風險也隨之升高；詳細級距請見上方「密度指數分級對照表」。本站僅呈現官方換算結果，不另行推算或調整分級標準。",
      },
      {
        question: "地圖資料多久更新一次？涵蓋哪些縣市？",
        answer:
          "本站每日同步一次疾病管制署「近12個月登革熱病媒蚊調查資料」，地圖僅顯示每一村里最近一次的調查結果（非每日全面普查，部分村里可能已一段時間未被重新調查）。資料涵蓋全國有進行病媒蚊密度調查之村里，非全臺每一村里皆有資料。",
      },
      {
        question: "指數偏高是否代表當地已爆發登革熱疫情？",
        answer:
          "不一定。密度指數反映的是病媒蚊孳生密度（傳播風險的環境因子），並非登革熱確診病例數或疫情本身；指數偏高代表當地應加強孳生源清除與防蚊措施，實際疫情與病例資訊請以地方衛生局及疾病管制署正式公告為準。",
      },
    ],
  },
  {
    slug: "bookstores",
    group: "culture-tourism",
    schemaType: "WebPage",
    title: "全國實體書店查詢",
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
    relatedSlugs: ["cultural-events", "public-art", "cool-spots"],
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
    group: "culture-tourism",
    schemaType: "WebPage",
    title: "全臺認證觀光工廠查詢",
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
    group: "life-services",
    schemaType: "WebPage",
    title: "全臺毛孩認領養查詢",
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
    description:
      "整合衛生福利部國民健康署官方開放資料，查詢全臺依法設置與自願設置之公共哺集乳室位置、地址、電話與開放時段。",
    directAnswer:
      "全國哺集乳室地圖整合國健署孕產兒關懷網站資料，提供全臺 3,800+ 處依法設置與自願設置哺集乳室，支援 22 縣市快選、GPS 距離排序與機構電話查詢。",
    group: "life-services",
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
    description:
      "整合臺灣婦產科醫學會 BeOK 避孕諮詢室認證機構名冊，提供全臺 88 家婦產科診所與 798 家諮詢藥局之雙圖層點位查詢與雙重避孕衛教指引。",
    directAnswer:
      "避孕諮詢地圖整合臺灣婦產科醫學會認證名冊，收錄全臺近 900 處專業婦產科診所與健保諮詢藥局，提供事前/事後口服避孕藥諮詢與雙重避孕指導。",
    group: "care-facility",
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
    description:
      "整合博客來 4 大暢銷榜、誠品線上 27 類主題選書與 TAAZE 讀冊生活 10 大注目與編輯推薦書單，涵蓋醫療保健、心理勵志、飲食料理、親子教養、熟齡長照與生活風格，即時掌握優質書單、定價優惠與讀者口碑好書。",
    directAnswer:
      "書籍推薦服務整合臺灣三大圖書通路，收錄博客來暢銷榜、誠品選書與 TAAZE 讀冊生活多元選書，涵蓋健康醫學、心理成長、生活風格與親子教養等多元好書，提供即時分類檢索與購書導覽。",
    group: "culture-tourism",
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
    group: "life-services",
    title: "全臺動物醫院與獸醫診所查詢",
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
    group: "transport-energy",
    title: "捷運營運與電梯檢修公告",
    description:
      "即時查詢臺北捷運各路線營運狀況、設備異常通報與各車站無障礙電梯檢修公告。資料來源：臺北大眾捷運公司。",
    directAnswer:
      "捷運營運與電梯檢修公告即時彙整捷運路線異常事件與各車站無障礙電梯檢修資訊，便利輪椅與推車族群預先規劃動線。",
    scientificBasis: [
      {
        title: "臺北捷運營運資訊與無障礙設施管理",
        authority: "臺北大眾捷運股份有限公司",
        url: "https://www.metro.taipei",
      },
    ],
    relatedSlugs: ["youbike", "disability-atm"],
    faqs: [
      {
        question: "公告資訊多久更新一次？",
        answer:
          "系統定時自動同步臺北大眾捷運公司發布之最新營運公告與電梯檢修排程，提供最新即時資訊。",
      },
      {
        question: "電梯檢修期間如何轉乘？",
        answer:
          "每筆公告均提供輪椅或行動不便旅客之替代出入口建議或替代車站指引。",
      },
    ],
  },
  {
    slug: "youbike",
    group: "transport-energy",
    title: "公共自行車 (YouBike 2.0) 即時動態",
    description:
      "即時查詢北北桃竹（臺北市、新北市、桃園市、新竹市）YouBike 2.0 與 2.0E 租借站點、可借車輛與空位數量。",
    directAnswer:
      "公共自行車即時動態跨直轄市整合北北桃竹 YouBike 2.0 站點，提供即時可借車輛數、可還空位數、電輔車數量與附近站點導航。",
    scientificBasis: [
      {
        title: "公共自行車租賃系統即時開放資料",
        authority: "交通部及各直轄市政府交通局",
        url: "https://www.youbike.com.tw",
      },
    ],
    relatedSlugs: ["metro-alerts", "aqi"],
    faqs: [
      {
        question: "支援哪些縣市的 YouBike 查詢？",
        answer:
          "目前整合臺北市、新北市、桃園市與新竹市之 YouBike 2.0 租借站點與即時可借車數、空位數。",
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
    group: "disaster-safety",
    title: "農作物病蟲害即時預警",
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
    relatedSlugs: ["weather-alerts", "uv"],
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
    group: "transport-energy",
    schemaType: "WebPage",
    title: "全臺電力概況儀表板",
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
    relatedSlugs: ["water-conditions", "aqi"],
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
    slug: "cpc-prices",
    group: "transport-energy",
    title: "中油各式油氣牌價查詢",
    description:
      "即時查詢臺灣中油（CPC）最新公告各式牌價，包含汽柴油零售（92/95/98/超級柴油）、家用天然氣、工業燃料油、桶裝液化石油氣（瓦斯）、海運用油、航空燃油、六大類油品、中油生技酒類及液化天然氣氣源成本分析。",
    directAnswer:
      "臺灣中油公告牌價涵蓋 92/95/98 無鉛汽油、超級柴油與家用天然氣等全品項，每週日公布新週油價、每月初調整天然氣與瓦斯牌價。",
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
    ],
    referenceTable: {
      title: "中油核心油品與天然氣規格對照表",
      headers: ["品項分類", "代表產品", "主要用途", "計價單位", "調整週期"],
      rows: [
        ["車用汽油", "98 / 95 / 92 無鉛汽油", "各類汽油車輛動力", "元/公升", "每週日公布、週一零點生效"],
        ["車用柴油", "超級柴油", "柴油引擎車輛與商用客貨車", "元/公升", "每週日公布、週一零點生效"],
        ["公用氣體", "天然氣 NG(1) / NG(2)", "家庭熱水烹飪、發電與工業用瓦斯", "元/立方公尺", "每月 1 日生效"],
        ["桶裝瓦斯", "液化石油氣 (LPG)", "家庭瓦斯桶、車用與工業加熱", "元/公斤", "每月 2 日生效"],
        ["工業燃料", "特種低硫燃料油", "鍋爐、石化發電與大型工業加熱", "元/公秉", "每週公布"],
      ],
    },
    relatedSlugs: ["cpc-stations", "power-grid-overview"],
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
    ],
    schemaType: "WebPage",
  },
  {
    slug: "cpc-stations",
    group: "transport-energy",
    title: "中油加油站服務據點地圖",
    description:
      "全臺臺灣中油（CPC）加油站多功能服務地圖，聚合 20 大便民設施：洗車服務、電動機車充換電、汽車電動車充電、來速咖啡（Cup Go）、輪胎充氣、數位打氣機、自助加油、代收停車費、無障礙廁所與悠遊卡/一卡通支付，支援 GPS 定位與多選交叉篩選。",
    directAnswer:
      "中油加油站多功能服務地圖整合全臺 600 多座自營與加盟站點，支援洗車、充換電、打氣加水、來速咖啡與電子票證等多維度服務即時篩選與導航。",
    scientificBasis: [
      {
        title: "中油加油站各項便民服務站點開放資料",
        authority: "臺灣中油股份有限公司 (CPC)",
        url: "https://www.cpc.com.tw",
      },
    ],
    referenceTable: {
      title: "中油加油站主要便民服務項目表",
      headers: ["服務類別", "項目名稱", "服務亮點", "適用對象"],
      rows: [
        ["車輛清潔", "洗車服務、車用吸塵器", "自動水刀/人工洗車、車室吸塵", "一般自用車主"],
        ["綠能充換電", "電動汽/機車充電、換電站", "中油自有與合作業者快充樁、Gogoro/光陽換電", "電動汽機車車主"],
        ["便利生活", "Cup Go 來速咖啡、中油複合商店", "免下車高品質現煮咖啡、在地農特產與中油生技", "通勤族與長途駕駛"],
        ["便利養護", "數位電子打氣機、加水、廢機油回收", "精準設定胎壓自動充氣、水箱加水、機油回收", "汽機車定期維護"],
        ["多元支付", "自助汽柴油、悠遊卡、一卡通、eTag", "省每公升油資、秒嗶感應付款、代收路邊停車費", "廣大駕駛人"],
      ],
    },
    relatedSlugs: ["cpc-prices", "youbike"],
    faqs: [
      {
        question: "如何在地圖上快速找到有提供洗車或電動車充電的中油加油站？",
        answer:
          "您可以直接點擊頂部的「快捷標籤」（如洗車服務、汽車充電、電動機車換電），或展開「20 項服務多選過濾」進行交集篩選，地圖會即時標出符合條件的站點。",
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
    group: "environment",
    schemaType: "WebPage",
    navLabel: "環保標章查詢",
    title: "環保標章與綠色生活認證查詢",
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
    relatedSlugs: ["public-toilets", "cool-spots", "carbon-footprint"],
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
    group: "care-facility",
    schemaType: "MedicalWebPage",
    title: "全臺急救責任醫院急診即時看板",
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
    relatedSlugs: ["clinics", "aed", "health-checks"],
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
    group: "disaster-safety",
    schemaType: "MedicalWebPage",
    title: "全國公共場所 AED 急救地圖",
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
    group: "registry",
    title: "全臺蔬果農藥殘留與食安檢驗透明看板",
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
    relatedSlugs: ["food-nutrition", "food-operators", "drugs"],
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
    group: "environment",
    title: "全臺戶外運動與放電安全指數",
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
    relatedSlugs: ["aqi", "uv", "weather-alerts", "dengue-mosquito-map"],
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
    group: "transport-energy",
    navLabel: "全臺無障礙交通地圖",
    title: "全臺無障礙交通地圖：低地板公車／捷運無障礙／通用計程車／復康巴士",
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
    relatedSlugs: ["metro-alerts", "youbike", "disability-atm", "long-term-care"],
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
    group: "disaster-safety",
    navLabel: "全臺積淹水即時感測地圖",
    title: "全臺積淹水即時感測地圖：路面淹水／水位防汛警戒／避難收容處所",
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
    group: "registry",
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
    group: "life-services",
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
    title: "全國心理諮商所地圖：合格心理諮商與心衛中心查詢",
    navLabel: "心理諮商所地圖",
    description:
      "查詢衛福部合法立案之公私立心理諮商所、臨床心理所與各縣市社區心理衛生中心，支援 1925 安心專線與專業晤談預約。",
    directAnswer:
      "心理諮商係由考選部及格、領有執照之諮商或臨床心理師所提供之專業心理晤談與評估，協助處理情緒困擾、創傷及人際議題。",
    scientificBasis: [
      {
        title: "衛生福利部心理健康司《心理師法》及立案機構規範",
        authority: "衛生福利部心理健康司",
        url: "https://dep.mohw.gov.tw/DOMHAOH/",
      },
    ],
    relatedSlugs: ["stress", "sleep", "clinics"],
    group: "care-facility",
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
    ],
  },
  {
    slug: "smoking-cessation",
    title: "戒菸門診特約院所查詢：二代戒菸補助與戒菸衛教",
    navLabel: "戒菸門診查詢",
    description:
      "查詢全國提供衛生福利部國民健康署二代戒菸治療與戒菸衛教補助之特約醫院、基層診所與社區藥局，享藥品免部分負擔。",
    directAnswer:
      "二代戒菸服務由國健署補助戒菸門診診察費與戒菸藥品費用，透過專業醫師評估與尼古丁替代療法大幅提升戒菸成功率。",
    scientificBasis: [
      {
        title: "衛生福利部國民健康署《菸害防制法》二代戒菸治療試辦計畫",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw/",
      },
    ],
    relatedSlugs: ["clinics", "pharmacies", "health-checks"],
    group: "care-facility",
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
    group: "care-facility",
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
    navLabel: "母嬰親善醫療院所",
    description:
      "查詢國健署評鑑通過之母嬰親善醫療院所名冊，提供 24 小時母嬰同室、母乳庫合作與專業國際泌乳顧問指導之友善生產環境。",
    directAnswer:
      "母嬰親善醫院係指符合世界衛生組織及國健署標準，支持母親自主決定生產方式、落實母嬰同室並全面推廣純母乳哺育之醫療院所。",
    scientificBasis: [
      {
        title: "衛生福利部國民健康署母嬰親善醫療院所認證基準",
        authority: "衛生福利部國民健康署",
        url: "https://www.hpa.gov.tw/",
      },
    ],
    relatedSlugs: ["breastfeeding-rooms", "contraception-map", "child-welfare-institutions"],
    group: "child-welfare",
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
    ],
  },
  {
    slug: "rare-disease-care",
    title: "罕見疾病照護諮詢中心與確診醫院查詢",
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
    group: "care-facility",
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
    group: "care-facility",
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
    relatedSlugs: ["home-healthcare", "long-term-care", "clinics"],
    group: "care-facility",
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
    group: "environment",
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
    slug: "green-shops",
    title: "全國綠色商店與環保標章商品地圖",
    navLabel: "綠色商店地圖",
    description:
      "查詢環境部認證之綠色商店、環保餐廳與碳足跡標籤商品販售通路，提供自備容器優惠、環保集點與友善低碳綠生活據點。",
    directAnswer:
      "綠色商店係指設置環保標章或碳足跡商品專區，並推動節能減塑、自備購物袋優惠措施之環境部認證綠色消費據點。",
    scientificBasis: [
      {
        title: "環境部資源循環署全民綠生活與綠色商店推廣要點",
        authority: "環境部",
        url: "https://www.moenv.gov.tw/",
      },
    ],
    relatedSlugs: ["green-certifications", "carbon-footprint", "cool-spots"],
    group: "environment",
    schemaType: "WebPage",
    faqs: [
      {
        question: "什麼是環境部認證的「綠色商店」？",
        answer:
          "綠色商店是指販售環保標章、節能標章、省水標章或綠建材標章商品，並承諾落實自身節能減碳、減少包裝廢棄物之實體通路或連鎖超市。",
      },
      {
        question: "在綠色商店消費能享有什麼好處？",
        answer:
          "消費者於綠色商店購買具環保標章產品，除可搭配環境部「環保集點 (GreenPoint)」累積綠點折抵消費外，許多據點亦提供自備購物袋或容器折價之實質獎勵。",
      },
    ],
  },
  {
    slug: "hearing-aid-subsidies",
    title: "助聽器評估特約醫療院所查詢：公費聽力輔具評估",
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
    relatedSlugs: ["clinics", "disability-welfare", "elder-welfare"],
    group: "life-services",
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
    relatedSlugs: ["life-services", "npo-organizations", "public-toilets"],
    group: "life-services",
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
    group: "disaster-safety",
    navLabel: "全臺即時停水查詢",
    title: "全臺即時停水與供水站地圖：自來水管線修復／計畫停水／取水點查詢",
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
];

/**
 * The SPECIFICATION.md 5.1 collation rule, in one place.
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
  "dengue-mosquito-map",
  "er-status",
  "aed",
  "food-safety",
  "outdoor-safety",
  "accessible-transit",
  "inundation-map",
  "water-outages",
]);

export const isToolIndexable = (tool: ToolCatalogEntry): boolean =>
  INDEXABLE_SLUGS.has(tool.slug);

export function toolsInGroup(
  group: ToolGroup,
  label: (tool: ToolCatalogEntry) => string = (tool) => tool.title,
): ToolCatalogEntry[] {
  return TOOL_CATALOG.filter((tool) => tool.group === group).sort((a, b) =>
    compareByStrokeOrder(label(a), label(b)),
  );
}

/** Look up a tool's catalog entry by slug — throws if missing so a typo'd slug fails
 * loudly at build/request time instead of silently rendering blank title/description. */
export function getToolCatalogEntry(slug: string): ToolCatalogEntry {
  const normalizedSlug =
    slug === "tax-organizations"
      ? "npo-organizations"
      : slug === "ltc-contracted"
      ? "long-term-care"
      : slug;
  const entry = TOOL_CATALOG.find((tool) => tool.slug === normalizedSlug);
  if (!entry) {
    throw new Error(`No TOOL_CATALOG entry for slug "${slug}"`);
  }
  return entry;
}
