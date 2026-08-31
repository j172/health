// Keyed by news_items.source_name, so this table covers every source that has
// ever been stored — not just the ones still being fetched. Seven feeds were
// retired in issue #92 (healthforall, twhealth, worldpeace, greenpeace,
// love_newlife, durex, commonhealth_club) and their labels stay: their articles
// were not deleted, so those rows still need a name on the card. Contrast
// culture_tw/public_art, whose rows ensureSchema deletes outright and which
// therefore appear nowhere here.
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
  healthforall: "大家健康雜誌",
  ttvc: "常春月刊",
  twhealth: "好健康（全民健康基金會）",
  heho: "Heho健康",
  mirrormedia_healthnews: "鏡週刊健康醫療網",
  udn_health: "元氣網（聯合報健康）",
  moenv: "環境部",
  setn: "祝你健康",
  ettoday: "ETtoday健康雲",
  healthnews: "健康醫療網",
  fiftyplus: "50+（橘世代）",
  yahoo_health: "Yahoo奇摩新聞健康",
  healthbw: "良醫健康網",
  edh: "早安健康",
  blog_j172: "j172tw Blogz",
  worldpeace: "世界和平會",
  greenpeace: "綠色和平",
  ibt: "盲人重建院",
  love_newlife: "癌友新生命協會",
  water_gov: "台灣自來水公司",
  womenshealth: "Women's Health 美力圈",
  ntuh: "臺大醫院",
  ntuh_ifc: "臺大整合醫療",
  durex: "杜蕾斯",
  helloyishi: "Hello 醫師",
  wegetcare: "醫聯網",
  uniqman: "UNIQMAN",
  sfunhk: "潮性辦公室",
  letsharu: "HARU",
  femh: "亞東紀念醫院",
  ankemedia: "AnkeMedia 安可人生",
  commonhealth_club: "康健大人社團",
  health_gvm: "健康遠見",
  istyle_lovesex: "iStyle 兩性情愛",
  tvbs_health: "TVBS 健康2.0",
  uho: "優活健康網",
  cgmh: "長庚紀念醫院",
  vghtpe: "臺北榮總",
  udn_woman: "udn 女子漾",
  ilady: "iLady 愛女也",
  lianhonghong: "臉紅紅",
  sungful: "嵩馥性健康管理中心",
  mamibuy: "媽咪拜",
  tasctaiwan: "台灣性諮商學會",
  tase: "台灣性教育學會",
};

export interface SourceLabelInput {
  dept_name: string | null;
  source_name?: string | null;
  feed_name: string;
}

/** Resolves a human-friendly attribution label for a news item across all RSS sources. */
export const resolveAuthorLabel = (item: SourceLabelInput): string =>
  item.dept_name || (item.source_name ? SOURCE_LABELS[item.source_name] : undefined) || item.feed_name;

/** Looks up a source_name's display label directly (falls back to the raw source_name if unmapped) — used by the source-branded image-missing placeholder (sourcePlaceholder.ts) where there's no dept_name/feed_name to fall back through like resolveAuthorLabel has. */
export const getSourceLabel = (sourceName: string): string => SOURCE_LABELS[sourceName] || sourceName;

/** Whether `sourceName` has a mapped label — i.e. whether scripts/generate-source-og-images.mjs will have generated a public/images/og/source/{sourceName}.png for it (that script mirrors this same map). Callers needing a static file path for an unmapped source should use "_default" instead. */
export const hasSourceLabel = (sourceName: string): boolean => sourceName in SOURCE_LABELS;
