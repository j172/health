# 01 新聞來源與擷取管線

> 合併自 39 份原始文件（37 份 spec＋2 份工單） · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 相關頁面：[新聞列表](https://health.j172.tw/news) · [首頁](https://health.j172.tw/)
> 狀態圖例：✅ 已上線（已核對程式碼）｜🟡 部分完成｜❌ 未實作／仍開放｜🗄️ 已取代或撤銷｜📚 研究／診斷｜⛔ 受阻

---

## 1. 目前真相（2026-10-12 實測）

| 項目 | 數值／狀態 |
|---|---|
| `RSS_FEEDS` 設定筆數 | 52（`lib/server/config/rss-feeds.ts`） |
| 其中 Google News `site:` 搜尋代理 | 11 筆（2026-08-31 時為 18 筆，已依新鮮度閘門陸續淘汰） |
| 來源分類（`sourceCategories.ts`） | `gov` 官方 24、`media` 媒體 49、`npo` 公益社福 29，共 102 個 `sourceName` |
| 擷取路徑 | **A. 標準 RSS**（`runIngestion.ts` → `enrichItem()`）＋ **B. 特殊來源爬蟲**（`processSpecialSource()`，約 50 個 feed code） |
| 寫入者 | 只剩 `persistItems.ts` 一個寫入 `news_items`（WRA 與 gov-opendata 第二寫入者皆已移除） |
| 新鮮度閘門 | `FRESHNESS_WINDOW_DAYS = 90`，超過 90 天的項目不入庫 |
| 排程 | in-app node-cron `5,35 * * * *`（每 30 分鐘），`withAdvisoryLock("rss_ingestion_lock")` 互斥 |
| 首頁新聞數 | `listDiverseHomeNews(30, 3)`：30 篇、每來源最多 3 篇 |
| 卡片導向 | 官方來源（`isGovSource()`）→ 站內 `/news/[id]` 全文；非官方 → 直接新分頁開原站並附 UTM |

### 1.1 收錄原則（所有來源共通）
1. **先入 DB 再讀 DB**：前台一律不直連上游。
2. **官方來源全文入庫**；**商業媒體只存標題／摘要／縮圖**（`skipDetailFetch: true`），點擊導回原站，尊重著作權。
3. **不做跨來源去重**：同一篇文章被多家轉載（例如 Yahoo 聚合）屬已接受的取捨。
4. **失敗隔離**：單一來源失敗寫入 `ingest_errors`，不影響其他來源。
5. **淘汰規則**：90 天內新鮮項目 ≤ 2 篇、或長期 0 成功的來源一律移除；`news_items` 歷史列預設保留（NTUH 例外，見下）。

---

## 2. 長期有效的決策（不要重新討論）

- 非官方來源一律不抓詳情頁全文（PR #329 決策，`news-fulltext-ingestion-cleanup` 再次確認為刻意設計）。
- 自由時報 403 是對方 CloudFront 邊緣層問題，站內沒有任何抓取行為，**站內無事可修**。
- Google News `site:` 搜尋是「站點索引」不是新聞 feed：新增來源不得再用它，除非實測新鮮度合格。
- `linetoday.edh.tw` 全站被 robots.txt 禁止，只爬 `edh.tw`。
- 運動部 OpenDataRSS 回傳 2020–2026 全量 1,871 筆，不是「最近 N 篇」feed，暫不收錄。
- WRA 枯旱通報是 2012 起的歷史紀錄，不適合放進新聞表（已移除）。
- `udn_woman` 改收女子漾全站 feed（不再只收情慾愛情分類）。

---

## 3. 核對後仍未完成的項目

| # | 項目 | 來源文件 | 說明 |
|---|---|---|---|
| N-1 | Google News `site:` 代理仍有 11 筆 | news-freshness-gate | 依新鮮度閘門持續觀察，不合格者逐一淘汰 |
| N-2 | 運動部新聞來源 | add-6-gov-news-sources | 需客製爬蟲做日期截斷，使用者決定之後再處理 |
| N-3 | `nhi.gov.tw` 新聞 | remove-9-never-succeeded | 健保署封鎖資料中心 IP（主機與 GitHub runner 皆 403），程式無解 |

---

## 4. 逐份紀錄

### 4.1 來源擴充（依上線時間）

#### Phase 6 — 環境部新聞（MOENV） ✅
- 原檔：[phase6-moenv-news-source.md](../archive/specs/phase6-moenv-news-source.md)
- 非 RSS 的 JSON API（`data.moenv.gov.tw/api/v2/mnews_p_01`），需 `MOENV_NEWS_API_KEY`；只收近 90 天、不回填 2001 起的歷史。
- 依 `fetchUdnHealthNews.ts` 先例寫獨立 fetcher；政府自有內容，`detailHtml` 直接存全文。
- `deletemark !== "0"` 的列略過；`relativeurl` 為 `"-"` 時改以站內全文呈現。

#### Phase 8 — 5 家媒體健康頻道 ✅
- 原檔：[phase8-media-health-news-sources.md](../archive/specs/phase8-media-health-news-sources.md)
- 新增 SETN 健康 2.0、ETtoday 健康雲、健康醫療網、50+ 健康分類、Yahoo 健康。
- Yahoo 用標準 RSS；其餘 4 家寫結構化 HTML 列表爬蟲（不用 Google News 代理）。
- 一律只存摘要＋縮圖。順手把 `runIngestion.ts` 複製貼上的特殊來源區塊重構成共用 helper。

#### Phase 10 — 良醫健康網（商業周刊） ✅
- 原檔：[phase10-businessweekly-health-source.md](../archive/specs/phase10-businessweekly-health-source.md)
- 無 RSS，爬 9 個 `/channel/NNNN` 列表頁；只取前約 10 張有日期與縮圖的真卡片，排除「熱門排行」側欄。
- 付費文章照收（只存摘要）；上線前先做人工 dry-run。

#### Phase 11 — 早安健康（edh.tw） ✅
- 原檔：[phase11-edh-health-source.md](../archive/specs/phase11-edh-health-source.md)
- 使用者給的是 LINE Today 網址，但該子網域被 robots.txt 全禁；改爬 `edh.tw/article-list`（實測 15/15 篇與 LINE Today 重疊）。
- 解析 Nuxt payload，`type === "article"` 結構性排除廣告；每次 2 頁約 3.5 天覆蓋。
- Google News `site:edh.tw` 被簡體色情 SEO spam 污染，拒用。

#### Phase 12 — 15 個健康／醫學中心／媒體來源 ✅（部分後續移除）
- 原檔：[phase12-expanded-media-and-health-sources.md](../archive/specs/phase12-expanded-media-and-health-sources.md)
- CDC 疫情訊息、致醫界通函、臺大醫院、亞東醫院、Women's Health、Hello 醫師、嬰兒與母親、醫聯網、杜蕾斯、HARU、UNIQMAN、潮性辦公室等。
- 後續：臺大醫院 2 筆（drop-ntuh）、嬰兒與母親（resurrected-cleanup）、UNIQMAN（remove-9）已移除。

#### Phase 13 — 6 個熟齡／生活媒體 ✅
- 原檔：[phase13-expanded-media-and-lifestyle-sources.md](../archive/specs/phase13-expanded-media-and-lifestyle-sources.md)
- 安可人生、康健大人社團（Google News 代理）、健康遠見、iStyle 兩性、TVBS 健康 2.0、優活健康網。

#### Phase 14 — 長庚、臺北榮總 ✅
- 原檔：[phase14-medical-centers-cgmh-vghtpe.md](../archive/specs/phase14-medical-centers-cgmh-vghtpe.md)
- 長庚 2 個 HTML 爬蟲（衛教活動、記者會）；北榮用 Google News 代理；歸類為 `gov`。

#### Phase 15 — 性健康與親子媒體 ✅（原文件為空檔）
- 原檔：[phase15-expanded-sexology-and-family-media-sources.md](../archive/specs/phase15-expanded-sexology-and-family-media-sources.md)（0 bytes）
- 實際內容見 commit `00da3ed`：UDN 女子漾、iLady、臉紅紅、嵩馥、媽咪拜、台灣性諮商學會、台灣性教育學會等 8 個來源。

#### Phase 3 — 19 大新聞與公益來源 ✅（部分後續移除）
- 原檔：[news-sources-expansion-phase3.md](../archive/specs/news-sources-expansion-phase3.md)
- 永齡、兒福聯盟×2、教育部家庭教育網、Hello 醫師、潮健康、草根影響力×2、康健大人社團、關鍵評論網×3、社家署、PChome×3、ETtoday 寵物／健康、國圖藝文。
- 官方／NPO 全文入庫，商業媒體摘要跳轉。
- 後續：社家署 HTML 版、家庭教育網、PChome×3 已因 0 成功移除（remove-9）。

#### APA 保護動物協會 ✅
- 原檔：[apatw-news-source.md](../archive/specs/apatw-news-source.md)
- `npo` 分類；每輪 4 頁共 16 篇；依標題標註「動保活動／毛孩照護／動物保護」。

#### MyGoPen 查核中心 ✅
- 原檔：[mygopen-news-source.md](../archive/specs/mygopen-news-source.md)
- Blogger RSS；抽「你可以先知道」作摘要；保留原生標籤到 `category_tags`。

#### 社企流（新聞＋活動） ✅
- 原檔：[seinsights-news-and-events.md](../archive/specs/seinsights-news-and-events.md)
- 文章收進新聞（`npo`）；活動收進[藝文活動](https://health.j172.tw/tools/cultural-events)，解析 Draft.js 抽場地與縣市。

#### 黑熊學院（新聞＋行事曆＋友站） ✅
- 原檔：[kuma-academy-and-civic-partners.md](../archive/specs/kuma-academy-and-civic-partners.md)
- 官方 JSON API；行事曆梯次展開到 `cultural_event_shows`；同時建立 Footer「公民倡議與友站」欄（見 [04](04-ia-navigation-civic.md)）。

#### NPO 公益新聞 8 家＋NPO Center 活動 ✅
- 原檔：[npo-news-sources-and-cultural-events.md](../archive/specs/npo-news-sources-and-cultural-events.md)（#182）
- 新增 `npo` 新聞分類；收國際特赦、NPO Center、唐氏症基金會、世界展望會、勵馨、心路等；世界和平、綠色和平、獨立評論從 `media` 改歸 `npo`。

#### 數位發展部新聞發布 ✅
- 原檔：[moda-press-news-source.md](../archive/specs/moda-press-news-source.md)
- 無 RSS、POST API 回 SSR HTML；日常爬首頁 15 筆，回溯模式用 POST 分頁；內文以 `div.article1.cpArticle` 精準擷取。

#### 6 個政府機關 RSS（人事總處／客委會／內政部） ✅
- 原檔：[add-6-gov-news-sources-dgpa-hakka-moi.md](../archive/specs/add-6-gov-news-sources-dgpa-hakka-moi.md)（PR #388）
- 11 個候選逐一實測：4 個與既有衛福部 RSS 重複、運動部全量傾印暫不收、6 個加入；`description` 已含全文所以 `skipDetailFetch: true`。

#### 候選來源查證流程 ✅
- 原檔：[new-news-sources-candidate-verification.md](../archive/specs/new-news-sources-candidate-verification.md)
- 規則：每個網址都要實際打開確認有 feed；沒有 feed 的不得硬寫爬蟲，改列給使用者決定。

#### 《報導者》 ✅
- 原檔：[SPEC-20261007-TWREPORTER-NEWS-SOURCE.md](../archive/specs/SPEC-20261007-TWREPORTER-NEWS-SOURCE.md)、工單 [TICKET-20261007-TWREPORTER-NEWS-SOURCE.md](../archive/tickets/TICKET-20261007-TWREPORTER-NEWS-SOURCE.md)（#428）
- `npo` 分類；全量收錄；`<enclosure>` 取首圖；CC BY-NC-ND 3.0 所以只導流不轉載全文。

#### UDN 女子漾改收全站 feed ✅
- 原檔：[SPEC-20260926-UDN-WOMAN-FULL-RSS-FEED.md](../archive/specs/SPEC-20260926-UDN-WOMAN-FULL-RSS-FEED.md)、工單 [TICKET-20260926-UDN-WOMAN-FULL-RSS-FEED.md](../archive/tickets/TICKET-20260926-UDN-WOMAN-FULL-RSS-FEED.md)（#421）
- URL 由 `/rssfeed/123166` 改 `/rssfeed`；`sourceName` 不變，歷史文章無縫延續。

#### 政府開放資料新聞整合 🗄️（2026-09-20 退役）
- 原檔：[gov-opendata-news-integration.md](../archive/specs/gov-opendata-news-integration.md)（#294）
- 原設計：第三條獨立管線收各部會開放資料新聞，90 天內抓全文、以外只存欄位，卡片加「🏛️ 政府開放資料」徽章。
- 被下一條取代。

#### 退役重複的 gov-opendata 管線 ✅
- 原檔：[retire-gov-opendata-news-pipeline.md](../archive/specs/retire-gov-opendata-news-pipeline.md)
- 12 筆設定中 5 筆已死或被擋、6 筆與 `rss-feeds.ts` 重複且網址更舊，只有高公局獨有；先把高公局與社家署 RSS 遷入主管線，再整條移除（已核對檔案不存在）。

### 4.2 品質閘門與全文擷取

#### 新鮮度閘門、未來日期、失效的 site-search feed ✅
- 原檔：[news-freshness-gate.md](../archive/specs/news-freshness-gate.md)
- 根因：管線沒有「文章多舊」的概念。台灣性諮商學會把標題中的活動日期當發布日 → 未來 5 天的文章釘在 `/news` 頂端；8 個 fetcher 寫死 `publishedAtUtc: null`。
- 18 個 Google News `site:` feed 實測新鮮度中位數 2–8 年；最佳者 100 筆只有 27 筆新鮮。
- 結果：加入 90 天閘門、淘汰 7 個 feed。

#### 詳情頁依來源設定擷取範圍 ✅
- 原檔：[detail-page-chrome-scoping.md](../archive/specs/detail-page-chrome-scoping.md)（#71）
- CWA W-pages 是儀表板，`<main>` 裡全是 UI 標籤，導致誤判地標「臺北市中正區」。
- 新增每網域 `skip / only / without` 設定表（`DETAIL_TEXT_SCOPING`），CWA 設為 `skip`。

#### 全部詳情頁來源普查 ✅
- 原檔：[detail-page-source-survey.md](../archive/specs/detail-page-source-survey.md)（#84）
- 規則：先量測（實際抓真文章，記錄容器、字數、前 200 字）再設定；Phase 14/15 新增的約 10 個來源補量測；修正 2 個完全抓不到內文的來源。

#### 全文抓取健康度稽核（工單）📚
- 原檔：[news-fulltext-fetch-health-audit.md](../archive/specs/news-fulltext-fetch-health-audit.md)（#340）
- 只產報告、不改程式；交付物為下一份。

#### 全文抓取健康度診斷結果 📚
- 原檔：[news-fulltext-fetch-findings.md](../archive/specs/news-fulltext-fetch-findings.md)
- 自由時報 403：站內根本沒有抓取（`skipDetailFetch`），卡片直接導原站；403 來自 LTN 的 CloudFront，與 Referer／UA 無關。
- 發現 3 條並行新聞管線、gov-opendata 管線多數已死、4 個非官方網域的擷取規則成為死程式碼、WordPress feed 的 `content:encoded` 從未當摘要使用。

#### 全文擷取整理 ✅
- 原檔：[news-fulltext-ingestion-cleanup-and-gov-fixes.md](../archive/specs/news-fulltext-ingestion-cleanup-and-gov-fixes.md)
- 移除 mamaclub／twstreetcorner／ilady／lianhonghong 的死規則；`normalizeItem.ts` 摘要優先採用 `content:encoded`；修亞東醫院、家庭教育網全文缺失。

### 4.3 來源移除

#### 移除 9 個從未成功的來源 ✅
- 原檔：[remove-9-never-succeeded-news-sources.md](../archive/specs/remove-9-never-succeeded-news-sources.md)（#386）
- `nhi_web`（IP 封鎖）、`uniqman_blog`（403）、`sfaa_news`（逾時）、`unitedway_news`（對方 TLS 憑證鏈缺中繼憑證，以 openssl 確認）、`moe_familyedu`、`moc_news`（403）、PChome×3（共用解析器、對方 502）。
- 不為小型 NPO 降低 TLS 驗證基準。

#### 移除 5 個永久逾時的國健署 RSS ✅
- 原檔：[remove-hpa-timeout-sources.md](../archive/specs/remove-hpa-timeout-sources.md)
- `hpa.gov.tw` 的 nodeid 124/126/127/128/129 在 GitHub runner 上 20 秒全部逾時；保留 `sourceCategories` 與 FeedCode 以顯示歷史文章。

#### 移除臺大醫院（含 IFC）並清除歷史 ✅
- 原檔：[drop-ntuh-source.md](../archive/specs/drop-ntuh-source.md)（#108）
- Google News `site:ntuh.gov.tw` 回傳掛號頁、健檢套餐、疾病辭典，中位年齡 > 1,700 天；**唯一一次連同歷史資料一起清除**。

#### 移除 WRA 枯旱來源 ✅
- 原檔：[drop-wra-drought-source.md](../archive/specs/drop-wra-drought-source.md)（#94、#13）
- 15 筆有效通報全部不在 90 天內；資料是 2012 起的歷史紀錄。取代 wra-single-writer。
- `lib/server/wra/runSync.ts` 仍存在，但已改做水位與水庫資料，不再寫新聞表（已核對）。

#### WRA 改走單一寫入者 🗄️
- 原檔：[wra-single-writer.md](../archive/specs/wra-single-writer.md)
- 前提「枯旱通報永遠是最新的」被證明錯誤，改為整個移除（見上一條）。

#### 被復活的死檔案清理 ✅
- 原檔：[resurrected-dead-code-cleanup.md](../archive/specs/resurrected-dead-code-cleanup.md)（PR #106）
- `.git/index` 損壞修復後，5 個已刪除的 WRA／嬰兒與母親檔案以未追蹤狀態重新出現；逐位元組比對後移除，不重新討論原決策。

#### Phase 5 — WRA 枯旱限水通報 🗄️
- 原檔：[phase5-wra-drought-alerts.md](../archive/specs/phase5-wra-drought-alerts.md)
- 原設計餵進天氣警報側欄；後被 drop-wra-drought-source 撤銷。

### 4.4 首頁與導流

#### 首頁新聞 54 → 30 篇 ✅
- 原檔：[homepage-news-count-30.md](../archive/specs/homepage-news-count-30.md)
- 純版面調整（非穩定性修復）；`maxPerSource` 維持 3。

#### 首頁新聞格加入部落格卡片 ✅
- 原檔：[home-news-blog-card-integration.md](../archive/specs/home-news-blog-card-integration.md)
- 第 24 張卡片放 `blog.j172.tw` 最新文章；6 秒逾時、失敗則退回第 24 篇新聞（`lib/server/blog/queries.ts` 已存在）。

#### 新聞卡片官方／非官方分流、移除 3 秒轉址 ✅
- 原檔：[news-card-destination-routing-and-no-delay-utm.md](../archive/specs/news-card-destination-routing-and-no-delay-utm.md)（#329）
- `getArticleDestination()` 統一分流；`/out` 改伺服器端 0 秒轉址；UTM：`utm_source=health.j172.tw`、`utm_medium` 依版位（`news_card`／`hero_post`／`news_sidebar`／`news_outbound`）。
- 修正世新大學純日期格式解析失敗而在同一秒大量入庫洗版。
