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
];