export interface SourceLink {
  sourceName: string;
  label: string;
}

export interface SourceCategory {
  /** URL-safe slug used by the /news?group= filter. */
  key: string;
  label: string;
  sources: SourceLink[];
}

/** Groups source_name values for the nav dropdowns and the /news?group= archive filter; labels match lib/server/news/sourceLabels.ts. */
export const SOURCE_CATEGORIES: SourceCategory[] = [
  {
    key: "gov",
    label: "官方機構",
    sources: [
      { sourceName: "mohw", label: "衛生福利部" },
      { sourceName: "hpa", label: "國民健康署" },
      { sourceName: "cdc", label: "疾病管制署" },
      { sourceName: "tfda", label: "食品藥物管理署" },
      { sourceName: "nhi", label: "中央健康保險署" },
      { sourceName: "moenv", label: "環境部" },
    ],
  },
  {
    key: "media",
    label: "媒體／其他網站",
    sources: [
      { sourceName: "google_news", label: "Google 新聞" },
      { sourceName: "ltn", label: "自由時報" },
      { sourceName: "top1health", label: "華人健康網" },
      { sourceName: "mamaclub", label: "媽媽經" },
      { sourceName: "twstreetcorner", label: "巷仔口社會學" },
      { sourceName: "cna", label: "中央社" },
      { sourceName: "commonhealth", label: "康健雜誌" },
      { sourceName: "healthforall", label: "大家健康雜誌" },
      { sourceName: "ttvc", label: "常春月刊" },
      { sourceName: "twhealth", label: "好健康" },
      { sourceName: "heho", label: "Heho健康" },
      { sourceName: "mirrormedia_healthnews", label: "鏡週刊健康醫療網" },
      { sourceName: "udn_health", label: "元氣網（聯合報健康）" },
      { sourceName: "csr_cw", label: "CSR@天下" },
      { sourceName: "esg_gvm", label: "ESG遠見" },
      { sourceName: "esg_businesstoday", label: "ESG今周刊" },
      { sourceName: "ubrand_udn", label: "倡議家" },
      { sourceName: "setn", label: "祝你健康" },
      { sourceName: "ettoday", label: "ETtoday健康雲" },
      { sourceName: "healthnews", label: "健康醫療網" },
      { sourceName: "fiftyplus", label: "50+（橘世代）" },
      { sourceName: "yahoo_health", label: "Yahoo奇摩新聞健康" },
      { sourceName: "healthbw", label: "良醫健康網" },
      { sourceName: "edh", label: "早安健康" },
    ],
  },
];

export const isGovSource = (sourceName: string): boolean => {
  if (sourceName === "cwa") return true;
  const govCat = SOURCE_CATEGORIES.find((c) => c.key === "gov");
  return Boolean(govCat?.sources.some((s) => s.sourceName === sourceName));
};

export const getSourceBadgeStyle = (sourceName: string) => {
  if (isGovSource(sourceName)) {
    return {
      bg: "bg-emerald-50 dark:bg-emerald-950/70",
      text: "text-emerald-700 dark:text-emerald-300",
      heroBg: "bg-emerald-600",
    };
  }
  return {
    bg: "bg-indigo-50 dark:bg-indigo-950/70",
    text: "text-indigo-600 dark:text-indigo-300",
    heroBg: "bg-indigo-600",
  };
};

