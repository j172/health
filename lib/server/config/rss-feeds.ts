import type { FeedConfig } from "@/types/rss";

export const RSS_FEEDS: FeedConfig[] = [
  {
    code: "16",
    name: "焦點新聞",
    url: "https://www.mohw.gov.tw/rss-16-1.html",
    sourceName: "mohw",
  },
  {
    code: "17",
    name: "即時新聞澄清",
    url: "https://www.mohw.gov.tw/rss-17-1.html",
    sourceName: "mohw",
  },
  {
    code: "18",
    name: "公告訊息",
    url: "https://www.mohw.gov.tw/rss-18-1.html",
    sourceName: "mohw",
  },
  {
    code: "101",
    name: "活動訊息",
    url: "https://www.mohw.gov.tw/rss-101-1.html",
    sourceName: "mohw",
  },
  {
    code: "2622",
    name: "最新消息",
    url: "https://www.mohw.gov.tw/rss-2622-1.html",
    sourceName: "mohw",
  },
  {
    code: "cdc",
    name: "疾病管制署－新聞稿",
    url: "https://www.cdc.gov.tw/RSS/RssXml/Hh094B49-DRwe2RR4eFfrQ?type=1",
    sourceName: "cdc",
  },
  {
    code: "tfda",
    name: "食品藥物管理署－本署公告",
    url: "https://www.fda.gov.tw/tc/rssAnnouncement.ashx",
    sourceName: "tfda",
  },
  {
    code: "hpa",
    name: "國民健康署－本署新聞",
    url: "https://www.hpa.gov.tw/Pages/ashx/rsspage.ashx?nodeid=124",
    sourceName: "hpa",
  },
  {
    code: "hpa_clarify",
    name: "國民健康署－真相說明",
    url: "https://www.hpa.gov.tw/Pages/ashx/rsspage.ashx?nodeid=126",
    sourceName: "hpa",
  },
  {
    code: "hpa_rumor",
    name: "國民健康署－保健闢謠",
    url: "https://www.hpa.gov.tw/Pages/ashx/rsspage.ashx?nodeid=127",
    sourceName: "hpa",
  },
  {
    code: "hpa_activity",
    name: "國民健康署－活動熱訊",
    url: "https://www.hpa.gov.tw/Pages/ashx/rsspage.ashx?nodeid=128",
    sourceName: "hpa",
  },
  {
    code: "hpa_announcement",
    name: "國民健康署－本署公告",
    url: "https://www.hpa.gov.tw/Pages/ashx/rsspage.ashx?nodeid=129",
    sourceName: "hpa",
  },
  {
    code: "gnews",
    name: "Google 新聞－台灣健康專區",
    url: "https://news.google.com/rss/search?q=%E5%81%A5%E5%BA%B7+location:taiwan&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "google_news",
    // Google News links redirect through an interstitial page instead of the real article,
    // so fetching/parsing the linked page would only yield Google's redirect shell.
    skipDetailFetch: true,
  },
  {
    code: "ltn",
    name: "自由時報－生活與健康新聞",
    url: "https://news.ltn.com.tw/rss/life.xml",
    sourceName: "ltn",
  },
  {
    code: "nhi",
    name: "中央健康保險署－新聞發布",
    url: "https://www.nhi.gov.tw/ch/rss-3255-1.xml",
    sourceName: "nhi",
  },
  {
    code: "top1health",
    name: "華人健康網",
    url: "https://www.top1health.com/Rss",
    sourceName: "top1health",
  },
  {
    code: "mamaclub",
    name: "媽媽經",
    url: "https://mamaclub.com/feed/",
    sourceName: "mamaclub",
  },
];