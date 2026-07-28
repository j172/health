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
    ],
  },
  {
    key: "esg",
    label: "ESG／永續",
    sources: [
      { sourceName: "csr_cw", label: "CSR@天下" },
      { sourceName: "esg_gvm", label: "ESG遠見" },
      { sourceName: "esg_businesstoday", label: "ESG今周刊" },
      { sourceName: "ubrand_udn", label: "倡議家" },
    ],
  },
];
