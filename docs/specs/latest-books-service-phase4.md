# 便民服務「最新書籍」全新工具規格 (Phase 4)

## 1. 概述 (Overview)
本規格實作使用者指定之便民服務全新工具：**「最新書籍」**（URL: `/tools/latest-books`，歸類於「便民服務」 `public-facility` 分類）。
整合台灣兩大代表性書籍通路：**博客來（4 大暢銷與新書榜單）** 與 **誠品線上（27 大主題選書類別）**，涵蓋醫學保健、熟齡長照、心理勵志、親子教養、寵物照護、社會科學與生活風格。

遵循使用者核心準則：
1. **「所有來源都是先入 DB 再從 DB 讀取」**：
   - 抓取器將書籍資料結構化寫入資料庫 `latest_books` 資料表。
   - 前端與 `/api/books` 一律從 DB 讀取，並以靜態種子 `data/latest-books-seed.json` 提供離線/無連線下的完整備援保證。
2. **完整收錄 4 大博客來榜單 + 27 類誠品選書**：
   - 提供直覺的平台切換（博客來 vs 誠品）、分類過濾標籤、書名／作者／出版社搜尋與價格折扣標籤。

---

## 2. 來源配置與收錄矩陣 (Source Taxonomy)

### 2.1 博客來（4 大暢銷／新書榜）
| # | 榜單名稱 | 類別代碼 (`categoryId`) | 目標 URL |
|---|---|---|---|
| 1 | 心理勵志 | `books_topm_04` | `https://www.books.com.tw/web/books_topm_04/?loc=P_menu_th_1_013` |
| 2 | 醫療保健 | `books_topm_07` | `https://www.books.com.tw/web/books_topm_07/?loc=P_menu_th_1_014` |
| 3 | 飲食料理 | `books_topm_08` | `https://www.books.com.tw/web/books_topm_08/?loc=P_menu_th_1_017` |
| 4 | 親子教養 | `books_topm_13` | `https://www.books.com.tw/web/books_topm_13/?loc=P_menu_th_1_023` |

### 2.2 誠品線上（27 大選書類別）
| # | 分類名稱 | 類別代碼 (`categoryId`) | 目標 URL |
|---|---|---|---|
| 1 | 醫學總論 | `cat_3_154` | `https://www.eslite.com/category/3/154` |
| 2 | 中醫／針灸 | `cat_3_155` | `https://www.eslite.com/category/3/155` |
| 3 | 飲食／營養 | `cat_3_159` | `https://www.eslite.com/category/3/159` |
| 4 | 養生／長壽 | `cat_3_158` | `https://www.eslite.com/category/3/158` |
| 5 | 疾病／預防 | `cat_3_160` | `https://www.eslite.com/category/3/160` |
| 6 | 常見疾病 | `cat_3_161` | `https://www.eslite.com/category/3/161` |
| 7 | 基礎醫學 | `cat_3_156` | `https://www.eslite.com/category/3/156` |
| 8 | 臨床醫學 | `cat_3_157` | `https://www.eslite.com/category/3/157` |
| 9 | 心靈成長 | `cat_2_125` | `https://www.eslite.com/category/2/125` |
| 10 | 心理諮商 | `cat_2_141` | `https://www.eslite.com/category/2/141` |
| 11 | 懷孕／育兒 | `cat_3_136` | `https://www.eslite.com/category/3/136` |
| 12 | 親子教養 | `cat_3_135` | `https://www.eslite.com/category/3/135` |
| 13 | 社會議題 | `cat_3_10` | `https://www.eslite.com/category/3/10` |
| 14 | 社會科學 | `cat_3_12` | `https://www.eslite.com/category/3/12_` |
| 15 | 性別研究 | `cat_3_11` | `https://www.eslite.com/category/3/11` |
| 16 | 家庭關係 | `cat_3_68` | `https://www.eslite.com/category/3/68` |
| 17 | 兩性關係 | `cat_3_67` | `https://www.eslite.com/category/3/67` |
| 18 | 熟齡生活 | `cat_3_64` | `https://www.eslite.com/category/3/64` |
| 19 | 樂齡保健 | `cat_3_50704` | `https://www.eslite.com/category/3/50704` |
| 20 | 長照關懷 | `cat_3_50705` | `https://www.eslite.com/category/3/50705` |
| 21 | 犬類照護 | `cat_3_50699` | `https://www.eslite.com/category/3/50699` |
| 22 | 貓咪照護 | `cat_3_50700` | `https://www.eslite.com/category/3/50700` |
| 23 | 水族／鳥類 | `cat_3_50701` | `https://www.eslite.com/category/3/50701` |
| 24 | 小動物／特殊寵物 | `cat_3_50702` | `https://www.eslite.com/category/3/50702` |
| 25 | 寵物心靈／訓練 | `cat_3_50703` | `https://www.eslite.com/category/3/50703` |
| 26 | 生活風格 | `cat_3_69` | `https://www.eslite.com/category/3/69` |
| 27 | 休閒嗜好 | `cat_3_65` | `https://www.eslite.com/category/3/65` |

---

## 3. 資料庫結構與儲存架構 (Database Schema & Storage)

### 3.1 `latest_books` 資料表
```sql
CREATE TABLE IF NOT EXISTS latest_books (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(32) NOT NULL COMMENT 'books_com_tw or eslite',
  category_id VARCHAR(64) NOT NULL,
  category_name VARCHAR(128) NOT NULL,
  ranking INT NULL COMMENT '榜單名次（1~100）',
  title VARCHAR(512) NOT NULL,
  subtitle VARCHAR(512) NULL,
  author VARCHAR(256) NULL,
  translator VARCHAR(256) NULL,
  publisher VARCHAR(256) NULL,
  publish_date VARCHAR(64) NULL,
  cover_url VARCHAR(1024) NULL,
  product_url VARCHAR(1024) NOT NULL,
  isbn VARCHAR(32) NULL,
  list_price INT NULL,
  sale_price INT NULL,
  discount VARCHAR(32) NULL,
  description TEXT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_prod (platform, product_url(255)),
  KEY idx_platform_cat (platform, category_id),
  KEY idx_title (title(128))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.2 離線預建種子 (`data/latest-books-seed.json`)
建立完整的預建種子檔案，涵蓋 31 類別之經典與最新書籍，確保：
- DB 未建立或遠端無連線時，前端與 API 能即時無痛 fallback。
- 通過 `verify-tool-sources.test.mjs` 之種子檔案驗證。

---

## 4. 系統實作規劃 (Implementation Steps)
1. **後端資料層**：
   - `lib/server/books/types.ts`：定義書籍資料型別。
   - `lib/server/books/schema.ts`：資料表結構與 migration。
   - `lib/server/books/scraper.ts`：博客來與誠品線上爬蟲解析器。
   - `lib/server/books/service.ts`：DB 查詢與離線種子備援邏輯。
   - `app/api/books/route.ts`：公開查詢 API。
   - `app/api/admin/books-sync/route.ts`：排程與手動同步 API。
2. **工具清單與導航整合**：
   - `lib/server/tools/catalog.ts`：新增 `latest-books` 於 `"public-facility"` (便民服務)。
   - `app/tools/latest-books/page.tsx`：頁面與 UI 元件。
3. **驗收測試**：
   - 單元測試 `lib/server/books/latestBooks.test.mjs`。
   - 更新 `scripts/verify-tool-sources.test.mjs` 工具數量（59 -> 60）與種子測試。
