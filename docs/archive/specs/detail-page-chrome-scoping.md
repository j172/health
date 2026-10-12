# Spec & Ticket: Per-Source Scoping for fetchDetailPage — stop ingesting publisher chrome as prose

- **Ticket ID**: `SPEC-HEALTH-20260829-CHROME-SCOPING`
- **Status**: TODO
- **Priority**: MEDIUM (P2)
- **Affects**: `lib/server/rss/fetchDetailPage.ts`

---

## 1. Problem Statement & Root Cause

`fetchDetailPage` scopes to `<article>` / `<main>` / `#maincontent` and strips `header,nav,footer` before taking `.text()`. For sites whose article really is the whole of `<main>`, that works. For a dashboard it does not: the toolbar, legend, tab strip and location picker all live **inside** `<main>`.

### Measured, CWA `W29.html?T=…` (source of `/news/863122`, 高溫資訊)

The container the current code selects yields 1230 characters, and they read:

```
發佈時間： 有效時間： 高溫資訊 回全縣市 地點切換 紅色燈號 氣溫達38°C以上且持續3日以上
橙色燈號 … 各縣市警特報 地區 燈號 註 另存圖片檔 產品說明文件(PDF) 健康氣象(熱傷害)
縣市預報總覽 12小時 24小時 36小時 鄉鎮預報 - 臺北市中正區 看更多 快速地點搜尋
選擇 選擇縣市 選擇鄉鎮 一週溫度曲線 …
```

Removing the obvious chrome blocks (`div.other`, `form.townBody`, `div.area_search_item-v9`, `div.tab-default`, `div.warn-list`) leaves 768 characters that are **still** chrome — a media-player control panel and table headers:

```
溫度分布圖 今日 昨日 前日 單張顯示（靜態） 播放 停止 播放操作說明 動態顯示
3小時 6小時 9小時 12小時 播放速度（1秒） . 循環播放 單次播放 顯示數值
高溫排行榜 … 排行 測站 時間 日最高溫 … PDF下載 PDF下載 PDF下載
```

`臺北市中正區` survives both passes: it sits in `h3.sm_subtitle` as 「鄉鎮預報 - 臺北市中正區 看更多」 — the label of a location-picker widget, prose-shaped and naming exactly one district, so #65's uniqueness rule accepts it. Two articles (`/news/863122`, `/news/861342`) are still badged 📍 台北市中正區 because of it.

### Why a deny-list does not work for this source

There is no article on these pages to keep. CWA's W-pages are dashboards; the bulletin prose reaches us through the feed's own `description`, not the detail page. Enumerating chrome selectors here means enumerating the entire page.

### Scope of harm

`detail_text` feeds `geo_summary`, `imageSearchTerms.ts`, reading-time estimates and the landmark extractor. For these articles the overwhelming majority of that input is UI labels.

### Precedent in this repo

`lib/server/news/cleanupChromeAssets.ts` already handles the same disease for a different asset type — chrome images scraped by an earlier `fetchDetailPage` — using a documented, per-offender pattern list. This spec follows that established shape rather than inventing a new one.

---

## 2. Agreed Architectural Blueprint

Add a per-source scoping table to `fetchDetailPage.ts`, keyed on the canonical URL's host. Three modes, in order of preference:

1. **`skip`** — do not scrape a detail page for this host at all; let `descriptionText` stand as the article body. **This is the correct mode for `cwa.gov.tw`**: its W-pages contribute nothing but chrome, and the bulletin text already arrives in the feed. The implementer must confirm against a live feed item that `description` does carry the bulletin prose before enabling this, and report the evidence.
2. **`only: <selector>`** — an allow-list. Take the article from this container and nothing else. Correct where a page is a dashboard with one genuine prose block.
3. **`without: <selector>`** — a deny-list, for pages that are mostly article with identifiable chrome.

Default when a host is not listed: today's behaviour, unchanged.

Entries must carry a comment naming the observed symptom and the date, the way `CHROME_IMAGE_PATTERNS` does. A selector list with no explanation rots the first time a publisher redesigns.

### Applies to `detailText` only

`detailHtml` and the image asset scan must keep seeing the current container, exactly as `SPEC-HEALTH-20260829-LANDMARK-SATURATION` did with the SVG strip — the rendered article keeps its map and images. The `skip` mode is the exception and must be explicit about what it leaves null.

---

## 3. Explicit Non-Goals

- Do **not** write a generic heuristic (e.g. "drop runs of interactive-element text with no sentence punctuation"). Rejected: normal Chinese article prose contains links and does not reliably end clauses with the punctuation such a rule would key on.
- Do **not** change the landmark extractor, `administrativeArea.ts`, `locationPrecision.ts` or any rendering. This ticket fixes the input.
- Do **not** backfill existing `news_items` — that is #72, and it should run after this so one pass picks up both.
- Do **not** touch `cleanupChromeAssets.ts`.

---

## 4. Verification & Quality Assurance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.
- For `cwa.gov.tw`: show the `detailText` produced before and after, and show that `description` carries the bulletin prose so nothing is lost by skipping.
- Show that `detailHtml` and the image asset list are unchanged for a host using `only` or `without`, and state how that was confirmed.
- Add a test over a saved fixture rather than the live network — the existing suite is `node --test` over `lib/**/*.test.mjs`, no framework.
- Report which hosts you configured and which you deliberately left on the default.
