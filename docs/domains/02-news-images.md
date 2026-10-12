# 02 新聞圖片管線

> 合併自 13 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 相關頁面：[新聞列表](https://health.j172.tw/news)
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作／仍開放｜🗄️ 已取代｜📚 研究／診斷

---

## 1. 目前真相：四層漏斗＋官方分流

```
新聞進站
 ├─ 官方公報（isGovSource）
 │    ├─ 有原廠圖表 → Tier 1：保留真實圖表
 │    └─ 沒有 → Tier 4：ThematicCover 官方白皮書向量封面（不配圖庫照片）
 └─ 民間媒體
      ├─ Tier 1：真圖（RSS enclosure/media/content:encoded → og:image → JSON-LD image）
      ├─ Tier 2：圖庫備援 Pixabay → Pexels → Unsplash（DB 持久化的 429 冷卻）
      ├─ Tier 3：重用本站已下載的同主題圖庫圖（最近 100 篇內不得重複）
      └─ Tier 4：ThematicCover 向量封面
```

| 元件 | 位置 |
|---|---|
| 進站擷取 | `normalizeItem.ts`（`leadImageUrl`）、`enrichItem()` 的 `fetchOpenGraphImageAsset` 補圖 |
| 特殊來源補圖 | `processSpecialSource()` 也會對無圖項目補抓 og:image（已核對） |
| 圖庫指派 | `assignMissingNewsCardImages`，獨立 in-app cron，每 10 分鐘 |
| 外部 OG 回填 | `news-og-backfill.yml`（GitHub runner 抓、經 SSH loopback 回寫，用於擋主機 IP 的媒體） |
| 圖片落地 | `public/images/news/articles/`（本機化，不熱連結）；Magic Bytes 嗅探容錯錯誤 MIME |
| 冷卻窗口 | `RECENCY_COLLISION_WINDOW = 100` |

---

## 2. 長期有效的決策

- **官方公報永不配歐美圖庫照片**（Decision 6）：沒有真圖就用向量封面。
- **絕不再對圖庫供應商做大量突發回填**：2026-08-17 約 3,000 次請求觸發 Pixabay 帳號層級長期限流；手動回填只允許「最近 N 小時、每輪 5 筆、最多 6 輪、間隔 10 分鐘」。
- 沒有 og:image 的文章是正常現象，不要硬塞圖庫圖。
- `news_card_images` 已放寬 `local_path` 與 `(provider, provider_image_id)` 唯一約束，允許同一張圖指派給多篇文章（每篇仍唯一一筆）。

---

## 3. 核對後仍未完成的項目

| # | 項目 | 來源文件 | 說明 |
|---|---|---|---|
| I-1 | 新聞內頁 JSON-LD 圖片卡在通用來源圖 | news-article-jsonld-stale-fallback-image | `resolveArticleImageUrl()` 未改；推測原因是 ISR 首次產生時尚無圖、低流量頁面不再重建。需先驗證再修（例如補圖後主動 revalidate） |
| I-2 | Issue #419 仍為 OPEN | four-tier-news-card-image-funnel | 程式碼已上線（`RECENCY_COLLISION_WINDOW`、ThematicCover 皆存在），issue 待關閉 |

---

## 4. 逐份紀錄

#### 四層圖片漏斗與歷史圖庫重用 ✅
- 原檔：[four-tier-news-card-image-funnel.md](../archive/specs/four-tier-news-card-image-funnel.md)（#419）
- Tier 3 以標題切詞＋主題關鍵字比對本機已下載圖；近 100 篇冷卻防撞圖；HeroPost 次要卡與搜尋結果也套用同一套縮圖。

#### 官方白皮書向量封面＋媒體真圖管線疏通 ✅
- 原檔：[news-thematic-cover-and-pipeline-resilience.md](../archive/specs/news-thematic-cover-and-pipeline-resilience.md)（PR #315）
- 根因四層：GHA 回填隊頭阻塞（每輪 20 筆 100% 失敗卻不累計嘗試次數）、MIME 嚴格比對誤殺（UDN 宣告 jpeg 實為 png）、官方公報配歐美假圖、圖庫圖與真圖互斥（有圖庫圖就永不再試真圖）。
- 修法：Magic Bytes 嗅探、失敗即累計降權、`CardThumb` 重構為 16:10 向量封面、允許真圖覆蓋圖庫圖。

#### 多供應商圖庫備援與遞增退避 ✅
- 原檔：[news-card-image-multi-provider-fallback.md](../archive/specs/news-card-image-multi-provider-fallback.md)（#29、PR #31）
- Pixabay → Pexels → Unsplash；每家 429 冷卻寫入 DB 並遞增；記錄「不得大量回填」的教訓。

#### 卡片圖片新鮮度排程 ✅
- 原檔：[news-card-image-freshness-scheduling.md](../archive/specs/news-card-image-freshness-scheduling.md)
- 把圖庫指派從 `runIngestion` 內聯（每次 10 筆）拆成獨立 10 分鐘排程；OG 回填從「只在部署時跑」改為獨立排程。目標：新文章 1 小時內有圖。

#### 圖片擷取、雙軌排程與 DB 效能 ✅
- 原檔：[news-card-images-and-dual-track-scheduling.md](../archive/specs/news-card-images-and-dual-track-scheduling.md)（PR #331）
- `normalizeItem` 解析 `enclosure`／`media:content`／`media:thumbnail`／`content:encoded`；下載加擬真 UA 與 Referer；解析 JSON-LD `image`。
- 補 `news_items (source_name, published_at_utc)` 索引，修 `/news?group=gov` 40 秒全表掃描造成的 502。

#### 抓圖流程診斷（工單）📚
- 原檔：[news-image-pipeline-audit.md](../archive/specs/news-image-pipeline-audit.md)
- 只產報告；不得假設是先前 EACCES 權限事故重演。

#### 抓圖流程診斷結果 📚
- 原檔：[news-image-pipeline-findings.md](../archive/specs/news-image-pipeline-findings.md)（PR #351）
- 無 DB 存取，以公開頁面抽樣約 220 筆。發現兩條進站路徑只有一條有補圖安全網、特殊來源 lazy-load 只讀 `src` 抓到佔位圖、Google News 轉址未解析、Hero 圖 regex 過時。

#### 備援缺口修復 ✅
- 原檔：[news-image-fallback-gap-fixes.md](../archive/specs/news-image-fallback-gap-fixes.md)
- 特殊來源補 og:image 安全網；6 個解析器補 `data-src`；同來源近期重複圖的輕量檢查；解析 Google News 轉址（`resolveGoogleNewsRedirect.mjs`）。

#### 新聞內頁 Hero 圖遺失（regex 過時） ✅
- 原檔：[news-hero-image-local-path-regex-fix.md](../archive/specs/news-hero-image-local-path-regex-fix.md)
- `/^https?:\/\//` 擋掉了本機化後的 `/images/news/articles/...` 相對路徑；改為同時接受絕對 URL 與 `/` 開頭路徑。重現案例：`/news/1014118`。

#### 新聞內頁 JSON-LD 圖片卡在預設圖 ❌
- 原檔：[news-article-jsonld-stale-fallback-image.md](../archive/specs/news-article-jsonld-stale-fallback-image.md)
- 見待辦 I-1。SQL 與 `toAbsoluteUrl()` 都正確，疑為 ISR 時序問題，需先驗證。

#### 最近新聞圖片安全回填 ✅
- 原檔：[recent-news-image-backfill.md](../archive/specs/recent-news-image-backfill.md)（#42）
- `POST /api/admin/news-images` 加 `newerThanHours`（1–168）；操作腳本固定 24 小時、5 筆、6 輪、間隔 10 分鐘；禁止 `clearCache`／`--reassign`。

#### 靜態地圖 SVG 與圖片韌性 ✅
- 原檔：[news-static-map-svg-and-image-resilience.md](../archive/specs/news-static-map-svg-and-image-resilience.md)
- `/uploads/maps/*.svg` 經 `/_next/image` 被拒（400）且元件無 `onError`，卡片永遠透明；加 `hasError` 退回、靜態地圖改存 `/images/news/maps/`。
- 註：新聞內頁地圖卡已於 2026-09-20 整個移除（見 [03](03-news-geo-landmark.md)）。

#### Phase 7 — 載入動畫（Orbs 與圖片骨架） ✅
- 原檔：[phase7-loading-animations.md](../archive/specs/phase7-loading-animations.md)
- 移植 aicss.dev 視覺為純 Tailwind 元件 `components/ui/LoadingOrb`，取代各處「查詢中…」純文字。
