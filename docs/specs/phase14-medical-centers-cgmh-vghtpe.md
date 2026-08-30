# Feature Specification: Major Medical Centers (Phase 14)

## Overview

Adds 3 news channels from two of Taiwan's leading medical centers — Chang Gung Memorial Hospital (長庚紀念醫院) and Taipei Veterans General Hospital (臺北榮民總醫院):

1. **長庚紀念醫院－活動與衛教消息** (`cgmh_news`, `https://www.cgmh.org.tw/tw/News/List/B`)
2. **長庚紀念醫院－記者會新聞稿** (`cgmh_press`, `https://www.cgmh.org.tw/tw/News/PressNewsList`)
3. **臺北榮民總醫院－最新消息** (`vghtpe_news`, RSS: Google News site-search `site:vghtpe.gov.tw`)

---

## Architectural Decisions & Standards

1. **Category Routing**:
   - Both sources represent premier medical centers and are assigned to the **`gov` category** (`SOURCE_CATEGORIES` key `gov`, emerald badge).

2. **In-process Ingestion & Cron Integration**:
   - Synchronized on the existing 30-minute interval (`"5,35 * * * *"` in `lib/server/cron/registerJobs.ts`).
   - Uses `withAdvisoryLock("rss_ingestion_lock")` and `getExistingPayloadHashes` to skip unchanged items.

---

## Technical Specifications

### A. RSS Feeds Configuration (`lib/server/config/rss-feeds.ts`)
- `vghtpe_news`: URL `https://news.google.com/rss/search?q=site:vghtpe.gov.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`, `skipDetailFetch: true`, sourceName `vghtpe`

### B. Special HTML Scrapers (`lib/server/rss/`)
- `fetchCgmhNews.ts`: Parses activity and health lecture links from `https://www.cgmh.org.tw/tw/News/List/B`.
- `fetchCgmhPressNews.ts`: Parses press releases and research breakthroughs from `https://www.cgmh.org.tw/tw/News/PressNewsList`.
