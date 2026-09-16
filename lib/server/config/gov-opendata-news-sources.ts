/**
 * Government Open Data & Official Public News Sources Configuration
 * 
 * Defines public datasets across health, welfare, environmental, safety, and transportation
 * ministries and local bureaus according to docs/specs/gov-opendata-news-integration.md.
 */

export interface GovOpenDataSource {
  id: string;
  sourceName: string;
  feedCode: string;
  feedName: string;
  ministry: string;
  agencyName: string;
  category: "health" | "environment" | "safety" | "transport" | "welfare";
  url: string;
  format: "rss" | "json";
  jsonMapping?: {
    listKey?: string;
    idKey?: string;
    titleKey?: string;
    contentKey?: string;
    descriptionKey?: string;
    urlKey?: string;
    dateKey?: string;
    deptKey?: string;
    categoryKey?: string;
  };
}

export const GOV_OPENDATA_SOURCES: GovOpenDataSource[] = [
  // --- 衛生福利部 (MOHW & Agencies) ---
  {
    id: "mohw-focus",
    sourceName: "mohw",
    feedCode: "16",
    feedName: "衛福部焦點新聞",
    ministry: "衛生福利部",
    agencyName: "衛生福利部",
    category: "health",
    url: "https://www.mohw.gov.tw/rss-16-1.html",
    format: "rss",
  },
  {
    id: "mohw-clarify",
    sourceName: "mohw",
    feedCode: "17",
    feedName: "衛福部即時新聞澄清",
    ministry: "衛生福利部",
    agencyName: "衛生福利部",
    category: "health",
    url: "https://www.mohw.gov.tw/rss-17-1.html",
    format: "rss",
  },
  {
    id: "mohw-announcement",
    sourceName: "mohw",
    feedCode: "18",
    feedName: "衛福部公告訊息",
    ministry: "衛生福利部",
    agencyName: "衛生福利部",
    category: "health",
    url: "https://www.mohw.gov.tw/rss-18-1.html",
    format: "rss",
  },
  {
    id: "cdc-press",
    sourceName: "cdc",
    feedCode: "cdc",
    feedName: "疾管署焦點新聞",
    ministry: "衛生福利部",
    agencyName: "疾病管制署",
    category: "health",
    url: "https://www.cdc.gov.tw/RSS/RssXml/Hh02008801?type=1",
    format: "rss",
  },
  {
    id: "cdc-epidemic",
    sourceName: "cdc",
    feedCode: "cdc_outbreak",
    feedName: "疾管署國際疫情通報",
    ministry: "衛生福利部",
    agencyName: "疾病管制署",
    category: "health",
    url: "https://www.cdc.gov.tw/RSS/RssXml/Hh02008801?type=2",
    format: "rss",
  },
  {
    id: "tfda-news",
    sourceName: "tfda",
    feedCode: "tfda",
    feedName: "食藥署焦點新聞與公告",
    ministry: "衛生福利部",
    agencyName: "食品藥物管理署",
    category: "health",
    url: "https://www.fda.gov.tw/tc/rss.aspx?cid=24",
    format: "rss",
  },
  {
    id: "hpa-news",
    sourceName: "hpa",
    feedCode: "hpa",
    feedName: "國健署健康焦點",
    ministry: "衛生福利部",
    agencyName: "國民健康署",
    category: "health",
    url: "https://www.hpa.gov.tw/rss.aspx?nodeid=124",
    format: "rss",
  },
  {
    id: "nhi-news",
    sourceName: "nhi",
    feedCode: "nhi",
    feedName: "健保署最新消息",
    ministry: "衛生福利部",
    agencyName: "中央健康保險署",
    category: "health",
    url: "https://www.nhi.gov.tw/rss.aspx?nodeid=11",
    format: "rss",
  },
  {
    id: "sfaa-news",
    sourceName: "sfaa",
    feedCode: "sfaa_news",
    feedName: "社家署最新消息",
    ministry: "衛生福利部",
    agencyName: "社會及家庭署",
    category: "welfare",
    url: "https://www.sfaa.gov.tw/SFAA/RSS.aspx?type=1",
    format: "rss",
  },

  // --- 環境部 (MOENV) ---
  {
    id: "moenv-news",
    sourceName: "moenv",
    feedCode: "moenv_mnews",
    feedName: "環境部焦點新聞",
    ministry: "環境部",
    agencyName: "環境部",
    category: "environment",
    url: "https://enews.moenv.gov.tw/Rss/",
    format: "rss",
  },

  // --- 農業部 (MOA) ---
  {
    id: "moa-news",
    sourceName: "moa",
    feedCode: "moa_news",
    feedName: "農業部焦點與動植物防疫公告",
    ministry: "農業部",
    agencyName: "農業部",
    category: "safety",
    url: "https://www.moa.gov.tw/rss.php?cat=news",
    format: "rss",
  },

  // --- 內政部 (MOI / NFA / NPA) ---
  {
    id: "nfa-news",
    sourceName: "nfa",
    feedCode: "moi_nfa",
    feedName: "內政部消防署防救災即時新聞",
    ministry: "內政部",
    agencyName: "消防署",
    category: "safety",
    url: "https://www.nfa.gov.tw/cht/index.php?act=rss&code=news",
    format: "rss",
  },

  // --- 交通部 (MOTC & Agencies) ---
  {
    id: "motc-news",
    sourceName: "motc",
    feedCode: "motc_news",
    feedName: "交通部即時新聞公告",
    ministry: "交通部",
    agencyName: "交通部",
    category: "transport",
    url: "https://www.motc.gov.tw/rss.jsp",
    format: "rss",
  },
  {
    id: "freeway-news",
    sourceName: "freeway",
    feedCode: "freeway_news",
    feedName: "高公局即時路況與最新消息",
    ministry: "交通部",
    agencyName: "高速公路局",
    category: "transport",
    url: "https://www.freeway.gov.tw/rss.aspx",
    format: "rss",
  },
  {
    id: "thb-news",
    sourceName: "thb",
    feedCode: "thb_news",
    feedName: "公路局即時路況與工程公告",
    ministry: "交通部",
    agencyName: "公路局",
    category: "transport",
    url: "https://www.thb.gov.tw/rss.aspx",
    format: "rss",
  },
];
