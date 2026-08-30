# Feature Specification: Expanded Media and Lifestyle Health Sources (Phase 13)

## Overview

Adds 6 additional high-impact media and lifestyle health sources to the platform, expanding coverage across senior living/elder care, healthy aging mindsets, relationship wellness, clinical medical news, and daily healthcare tips:

1. **AnkeMedia 安可人生** (`ankemedia`, RSS: `https://ankemedia.com/feed`)
2. **康健大人社團** (`commonhealth_club`, RSS: Google News site-search `site:club.commonhealth.com.tw`)
3. **健康遠見** (`health_gvm`, RSS: `https://health.gvm.com.tw/rss`)
4. **iStyle 兩性情愛（自由時報）** (`istyle_lovesex`, `https://istyle.ltn.com.tw/love-sex`)
5. **TVBS 健康2.0** (`tvbs_health`, `https://health.tvbs.com.tw/`)
6. **優活健康網** (`uho`, `https://www.uho.com.tw/index.asp`)

---

## Architectural Decisions & Standards

1. **Category Routing**:
   - All 6 sources are assigned to the `media` category (`SOURCE_CATEGORIES` key `media`, indigo badge).

2. **Copyright & Summary-Only Ingestion**:
   - Commercial media outlets follow the `skipDetailFetch: true` rule (storing only title, description/summary, publish timestamp, canonical URL, and OG thumbnail). No full-text body HTML is stored.

3. **In-process Ingestion & Cron Integration**:
   - Synchronized on the existing 30-minute interval (`"5,35 * * * *"` in `lib/server/cron/registerJobs.ts`).
   - Uses `withAdvisoryLock("rss_ingestion_lock")` and `getExistingPayloadHashes` to skip unchanged items.

---

## Technical Specifications

### A. RSS Feeds Configuration (`lib/server/config/rss-feeds.ts`)
- `ankemedia_rss`: URL `https://ankemedia.com/feed`, `skipDetailFetch: true`, sourceName `ankemedia`
- `commonhealth_club`: URL `https://news.google.com/rss/search?q=site:club.commonhealth.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`, `skipDetailFetch: true`, sourceName `commonhealth_club`
- `gvm_health_rss`: URL `https://health.gvm.com.tw/rss`, `skipDetailFetch: true`, sourceName `health_gvm`

### B. Special HTML Scrapers (`lib/server/rss/`)
- `fetchIstyleLoveSexNews.ts`: Parses `article/{id}` links from `https://istyle.ltn.com.tw/love-sex`.
- `fetchTvbsHealthNews.ts`: Parses `/medical/`, `/nutrition/`, `/regimen/` links from `https://health.tvbs.com.tw/`.
- `fetchUhoNews.ts`: Parses `article-{id}.html` links from `https://www.uho.com.tw/index.asp`.
