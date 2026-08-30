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
    // Skip full article HTML scrape (ltn <head>/<base> used to leak into
    // detail_html). Card thumbs still come from a lightweight og:image pull
    // in runIngestion (fetchOpenGraphImageAsset) — not from body images.
    skipDetailFetch: true,
  },
  {
    code: "nhi",
    name: "中央健康保險署－新聞發布",
    url: "https://news.google.com/rss/search?q=site:nhi.gov.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "nhi",
    skipDetailFetch: true,
  },
  {
    code: "top1health",
    name: "華人健康網",
    url: "https://www.top1health.com/Rss",
    sourceName: "top1health",
    // Same detail-page scraping issue as ltn.com.tw; use the RSS description instead.
    // Card thumbs: OG pull via runIngestion when assets are empty.
    skipDetailFetch: true,
  },
  {
    code: "mamaclub",
    name: "媽媽經",
    url: "https://mamaclub.com/feed/",
    sourceName: "mamaclub",
  },
  {
    code: "twstreetcorner",
    name: "巷仔口社會學",
    url: "https://twstreetcorner.org/feed/",
    sourceName: "twstreetcorner",
  },
  {
    code: "cna_lifehealth",
    name: "中央社－生活醫藥",
    url: "https://feeds.feedburner.com/rsscna/lifehealth",
    sourceName: "cna",
  },
  {
    code: "cwa_warning",
    name: "中央氣象署－警報、特報",
    url: "https://www.cwa.gov.tw/rss/Data/cwa_warning.xml",
    sourceName: "cwa",
  },
  {
    code: "csr_cw",
    name: "CSR@天下",
    url: "https://news.google.com/rss/search?q=site:csr.cw.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "csr_cw",
    // Google News links redirect through an interstitial page instead of the real article.
    skipDetailFetch: true,
  },
  {
    code: "esg_gvm",
    name: "ESG遠見",
    url: "https://news.google.com/rss/search?q=site:esg.gvm.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "esg_gvm",
    skipDetailFetch: true,
  },
  {
    code: "esg_businesstoday",
    name: "ESG今周刊",
    url: "https://news.google.com/rss/search?q=site:esg.businesstoday.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "esg_businesstoday",
    skipDetailFetch: true,
  },
  {
    code: "ubrand_udn",
    name: "倡議家",
    url: "https://news.google.com/rss/search?q=site:ubrand.udn.com&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "ubrand_udn",
    skipDetailFetch: true,
  },
  {
    code: "commonhealth",
    name: "康健雜誌",
    // commonhealth.com.tw has no RSS feed of its own and its site sits behind
    // a Cloudflare JS challenge that blocks direct scraping (confirmed via
    // curl — even robots.txt returns a "Just a moment..." challenge page),
    // so use the same Google News site-search fallback as csr_cw/esg_gvm/
    // esg_businesstoday/ubrand_udn.
    url: "https://news.google.com/rss/search?q=site:commonhealth.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "commonhealth",
    // Google News links redirect through an interstitial page instead of the real article.
    skipDetailFetch: true,
  },
  {
    code: "healthforall",
    name: "大家健康雜誌",
    // healthforall.com.tw (董氏基金會) has no RSS feed of its own; Google
    // News site-search fallback confirmed clean (no spam pollution, unlike edh.tw).
    url: "https://news.google.com/rss/search?q=site:healthforall.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "healthforall",
    skipDetailFetch: true,
  },
  {
    code: "ttvc",
    name: "常春月刊",
    // ttvc.com.tw has no RSS feed of its own; Google News site-search
    // fallback confirmed clean.
    url: "https://news.google.com/rss/search?q=site:ttvc.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "ttvc",
    skipDetailFetch: true,
  },
  {
    code: "twhealth",
    name: "好健康（全民健康基金會）",
    // twhealth.org.tw has no RSS feed of its own; Google News site-search
    // fallback confirmed clean.
    url: "https://news.google.com/rss/search?q=site:twhealth.org.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "twhealth",
    skipDetailFetch: true,
  },
  {
    code: "heho",
    name: "Heho健康",
    // Real WordPress RSS feed of its own (unlike the sources above) — no
    // Google News fallback needed. Article pages fetch fine directly too.
    url: "https://heho.com.tw/feed",
    sourceName: "heho",
  },
  {
    code: "yahoo_health",
    name: "健康",
    // Real RSS 2.0 feed of its own (confirmed live, Phase 8 spec section
    // 1a) — unlike SETN/ETtoday/healthnews.com.tw/fiftyplus below, which
    // have no RSS and are handled as special sources in runIngestion.ts.
    url: "https://tw.news.yahoo.com/rss/health",
    sourceName: "yahoo_health",
    skipDetailFetch: true,
  },
  {
    code: "gnews_topic",
    name: "Google 新聞－健康專區",
    url: "https://news.google.com/rss/topics/CAAqJQgKIh9DQkFTRVFvSUwyMHZNR3QwTlRFU0JYcG9MVlJYS0FBUAE?hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "google_news",
    skipDetailFetch: true,
  },
  {
    code: "worldpeace",
    name: "世界和平會",
    url: "https://news.google.com/rss/search?q=site:worldpeace.org.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "worldpeace",
    skipDetailFetch: true,
  },
  {
    code: "greenpeace",
    name: "綠色和平",
    url: "https://news.google.com/rss/search?q=site:greenpeace.org/taiwan&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "greenpeace",
    skipDetailFetch: true,
  },
  {
    code: "ibt",
    name: "盲人重建院",
    url: "https://news.google.com/rss/search?q=site:ibt.org.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "ibt",
    skipDetailFetch: true,
  },
  {
    code: "love_newlife",
    name: "癌友新生命協會",
    url: "https://news.google.com/rss/search?q=site:love-newlife.org&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "love_newlife",
    skipDetailFetch: true,
  },
  {
    code: "cdc_outbreak",
    name: "疾病管制署－疫情訊息",
    url: "https://www.cdc.gov.tw/RSS/RssXml/khD5i5xbqmYc8zCDhJimNg?type=1",
    sourceName: "cdc",
  },
  {
    code: "cdc_letters",
    name: "疾病管制署－致醫界通函",
    url: "https://www.cdc.gov.tw/RSS/RssXml/VYgwM0EtOqAhCmd0iJrhfg?type=4",
    sourceName: "cdc",
  },
  {
    code: "womenshealth_tw",
    name: "Women's Health 美力圈",
    url: "https://www.womenshealthmag.com/tw/rss/default.xml",
    sourceName: "womenshealth",
    skipDetailFetch: true,
  },
  {
    code: "ntuh_news",
    name: "臺大醫院",
    url: "https://news.google.com/rss/search?q=site:ntuh.gov.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "ntuh",
    skipDetailFetch: true,
  },
  {
    code: "ntuh_ifc_news",
    name: "臺大整合醫療",
    url: "https://news.google.com/rss/search?q=site:ntuh.gov.tw/ifc&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "ntuh_ifc",
    skipDetailFetch: true,
  },
  {
    code: "durex_article",
    name: "杜蕾斯",
    url: "https://news.google.com/rss/search?q=site:durex-store.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "durex",
    skipDetailFetch: true,
  },
  {
    code: "ankemedia_rss",
    name: "AnkeMedia 安可人生",
    url: "https://ankemedia.com/feed",
    sourceName: "ankemedia",
    skipDetailFetch: true,
  },
  {
    code: "commonhealth_club",
    name: "康健大人社團",
    url: "https://news.google.com/rss/search?q=site:club.commonhealth.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "commonhealth_club",
    skipDetailFetch: true,
  },
  {
    code: "gvm_health_rss",
    name: "健康遠見",
    url: "https://health.gvm.com.tw/rss",
    sourceName: "health_gvm",
    skipDetailFetch: true,
  },
  {
    code: "vghtpe_news",
    name: "臺北榮總",
    url: "https://news.google.com/rss/search?q=site:vghtpe.gov.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    sourceName: "vghtpe",
    skipDetailFetch: true,
  },
];
