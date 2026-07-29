const SOURCE_LABELS: Record<string, string> = {
  mohw: "衛生福利部",
  google_news: "Google 新聞",
  ltn: "自由時報",
  nhi: "中央健康保險署",
  cdc: "疾病管制署",
  tfda: "食品藥物管理署",
  hpa: "國民健康署",
  top1health: "華人健康網",
  mamaclub: "媽媽經",
  twstreetcorner: "巷仔口社會學",
  cna: "中央社",
  cwa: "中央氣象署",
  csr_cw: "CSR@天下",
  esg_gvm: "ESG遠見",
  esg_businesstoday: "ESG今周刊",
  ubrand_udn: "倡議家",
  commonhealth: "康健雜誌",
};

export interface SourceLabelInput {
  dept_name: string | null;
  source_name?: string | null;
  feed_name: string;
}

/** Resolves a human-friendly attribution label for a news item across all RSS sources. */
export const resolveAuthorLabel = (item: SourceLabelInput): string =>
  item.dept_name || (item.source_name ? SOURCE_LABELS[item.source_name] : undefined) || item.feed_name;
