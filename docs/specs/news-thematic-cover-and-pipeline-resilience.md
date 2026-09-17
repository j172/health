# 新聞缺圖全方位解決方案：官方公報白皮書微視覺、媒體真圖管線疏通與三層漏斗

- **狀態**：Approved (經正體中文 Grill Me 深度審定共識)
- **領域**：新聞視覺呈現（CardThumb / ThematicCover）、外部圖片下載與 Magic Bytes 二進位嗅探、GitHub Actions 背景回填排程（news-og-backfill）、資料庫查詢與降權重試機制
- **目標**：徹底根治全站「新聞很多都沒有圖片」的問題，落實官方公報與民間媒體的分流策略；建立專屬白皮書特刊向量微視覺，修復媒體真實 OG 圖片隊頭阻塞，並建立穩固的三層漏斗備援機制。

---

## 1. 背景與根本問題

使用者反映全站大量新聞無圖片或呈現空白漸層字卡，經環境與 GitHub Actions 實況調查，發現以下四層深層病因：

1. **GitHub Actions 隊頭阻塞（Head-of-Line Blocking）**：
   - 排程 `news-og-backfill.yml` 每半小時執行一次，但執行日誌顯示**每輪 20 筆 100% 失敗、0 筆成功**。
   - 失敗原因涵蓋 403 阻擋、無 OG 標籤或格式檢驗失敗。由於失敗時外部 Runner 沒有回報後端累計重試次數（`image_backfill_attempts` 永遠為 0），導致每次排程一啟動永遠優先抓到這 20 篇失敗新聞。
   - 腳本在第一輪指派數為 0 時直接中斷（`no assignments this round — stopping`），造成後方成千上萬篇本來可以成功抓到真圖的媒體新聞完全被堵死。
2. **二進位格式與標頭誤殺（Strict MIME Rejection）**：
   - 部分台灣權威媒體的伺服器 HTTP 標頭不精準。例如《聯合報元氣網》傳送真實 PNG 圖檔但 Header 宣告為 `image/jpeg`；《健康遠見》宣告 `image/jpg`（未帶 `e`）。
   - 既有 `downloadArticleImage.ts` 採嚴格字串比對，導致這些具備合法新聞照片的文章被檢驗器直接判定為非法格式並丟棄。
3. **官方公報硬配歐美庫存假圖，破壞公信力**：
   - 過去排程自動比對 Pixabay/Pexels 關鍵字，使許多台灣本土衛生局或公文新聞配上歐美模特兒或化驗儀器，突兀且削弱權威性；若關鍵字比對失敗則退回無資訊量之單調淺綠色塊（「🏛️ 衛生福利部」），視覺猶如破圖骨架。
4. **庫存圖與真圖互斥衝突**：
   - 既有 `backfillOgImages.ts` 查詢條件要求 `c.news_item_id IS NULL`。若一篇新聞先被指派了 Pixabay 假圖，後續就永遠不再嘗試抓取原廠真實 OG 圖。

---

## 2. 規格共識與核心決策 (Grill Me 審定)

1. **核心定位：分流策略（Forking Strategy）**
   - **官方公報類**：不強配不相干圖庫假圖，改制為專屬官方白皮書特刊向量微視覺，保留真實圖表。
   - **民間媒體類**：全力提升原廠真實圖抓取率，並以庫存圖庫作為第二層備援漏斗。
2. **公報視覺樣式：16:10 專屬主題向量微視覺**
   - 維持 Grid 的 16:10 封面結構確保網格韻律一致。
   - 徹底重構 `CardThumb.tsx`，以現代幾何 SVG 向量徽章與專屬部會配色，打造「官方特刊白皮書封面」，0 外部請求、0 CLS、自動適配深色模式。
3. **媒體抓圖管線：三層漏斗（Three-tier Funnel）**
   - **Tier 1（寬鬆真圖）**：導入二進位 Magic Bytes 智慧嗅探，容錯 `image/jpg` 與標頭誤標；修復 GHA 隊頭阻塞，失敗時立即累計嘗試次數自動降權。
   - **Tier 2（圖庫備援）**：媒體新聞若真圖抓取失敗達上限，由 Pixabay / Pexels 自動配對相關素材圖補位。
   - **Tier 3（主題卡）**：若真圖與圖庫皆無，退回媒體專屬主題卡。
4. **歷史回填範圍：新鮮度優先（Freshness-first）**
   - 優先處理新進新聞與最近 14 天內（`newerThanHours: 336`）的缺圖新聞，避免對第三方新聞網站造成高頻衝擊而被封鎖 IP，14 天以前舊聞優雅由主題卡承接。
5. **主題微視覺體系：機關專屬白皮書風格**
   - 以主管機關 `source_name` 為核心，為疾管署（CDC 防疫盾牌與生命波形）、食藥署（TFDA 食安檢驗章）、健保署（NHI 照護雙手與健保十字）、國健署（HPA 身心健康脈動）、環境部／氣象署（MOENV/CWA 氣象等壓線與生態水滴）、衛福部（MOHW 國家衛政金徽）等量身設計。
6. **歷史假圖處置：顯示層智能覆蓋**
   - 官方機構若擁有原廠圖表（`news_assets` 中的公文圖表、疫情地圖），**100% 繼續保留顯示真實圖表**。
   - 官方機構若僅有 Pixabay / Pexels 庫存假圖，前端智能覆蓋為白皮書特刊封面，全站即時煥然一新且零資料庫更動風險。

---

## 3. 架構設計與模組規劃

### 3.1 官方專屬白皮書特刊封面 (`components/News/ThematicCover.tsx`)
- 提供純前端 SVG 向量封面渲染。
- 頂部呈現機構徽章與官方分類標籤，中央呈現文章標題與發布科室排版，底部呈現「HEALTHZ GAZETTE」與專屬權威印記。
- 支援 `compact` 模式，供 80px 水平卡片縮圖無溢出使用。

### 3.2 縮圖組件整合與智能覆蓋 (`components/News/CardThumb.tsx`)
- 整合 `ThematicCover`。
- 智能判斷：`!src || hasError || (isGov && isStockPhoto(item.card_image_source))` 時切換為 `ThematicCover`。

### 3.3 二進位 Magic Bytes 嗅探與容錯 (`lib/server/images/imageBytes.ts` ＆ `downloadArticleImage.ts`)
- `normalizeMimeType(declaredMime)`：支援 `image/jpg` 映射為 `image/jpeg`，並處理未帶 `image/` 的 bare subtype。
- `detectMimeFromSignature(buffer)`：精確偵測 JPEG (`FF D8 FF`)、PNG (`89 50 4E 47`)、WebP (`RIFF..WEBP`) 與 GIF (`GIF87a/89a`)。
- 在 `storeArticleImageBuffer` 中自動修正標頭與實際內容不符的圖檔，消除誤殺。

### 3.4 破除隊頭阻塞與失敗回報 (`scripts/gha-og-external-backfill.mjs` ＆ `app/api/admin/news-images/route.ts` ＆ `backfillOgImages.ts`)
- `backfillOgImages.ts` 匯出 `markCardImageFailure(newsItemId)`，執行 `UPDATE news_items SET image_backfill_attempts = image_backfill_attempts + 1 WHERE id = ?`。
- `listMissingCardImageTargets` 排除 `gov` 官方機構，並支援 `newerThanHours`（預設 336 小時 = 14 天）。
- `app/api/admin/news-images/route.ts` 新增 `{ markFailed: true, newsItemId }` API 處置。
- `gha-og-external-backfill.mjs` 遭遇任何失敗立即呼叫 `markFailed` 回報後端，破除死循環。
- `cardImages.ts` 在 `assignMissingNewsCardImages` 中排除 `gov` 官方機構，確保 API 配額專供媒體新聞。

---

## 4. 驗證與測試計畫

1. **單元測試**：
   - `tests/imageSniffingAndValidation.test.mjs`：驗證 MIME 正規化、二進位簽名比對與實際檔案儲存復原。
   - `tests/thematicCoverAndCardThumb.test.mjs`：驗證官方機構識別、真圖保留與庫存假圖覆蓋分流。
2. **全站測試**：`npm test` 全數 289 項測試無迴歸。
3. **靜態型別安全**：`npm run typecheck` 0 錯誤。
