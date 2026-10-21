# j172tw Healthz 文件總索引

> 2026-10-12 整併：原本散落在 `docs/specs/`（182 份）、`docs/tickets/`（6 份）與 2 份總規格的 190 份 Markdown，依領域合併為 13 份文件。每一份原始文件都恰好收錄在一份領域文件中，所有狀態都已對照程式碼與 GitHub issue／PR 重新核對（基準 `main` @ `7fe098b`）。
> 原始文件已於 2026-10-21 移出工作樹，內容完整保留在 git 歷史（見文末「原始文件」）。
> 網站：[https://health.j172.tw/](https://health.j172.tw/)

## 從哪裡開始讀

| 想知道… | 讀這份 |
|---|---|
| 系統整體怎麼運作、有哪些硬限制 | [architecture.md](architecture.md) |
| 接下來要做什麼（2.0） | [2.0/master-plan.md](2.0/master-plan.md)（研究＋24 項決策）、[2.0/spec-issue-438.md](2.0/spec-issue-438.md)（PRD，正本為 [Issue #438](https://github.com/j172/health/issues/438)） |
| 某個功能的歷史與決策 | 下方領域文件 |
| 還有哪些已知問題沒處理 | 本頁「跨領域待辦彙整」 |

## 領域文件

| # | 文件 | 原始文件數 | 涵蓋 |
|---|---|---|---|
| 01 | [新聞來源與擷取管線](domains/01-news-sources.md) | 39 | 來源擴充 Phase 3–15、品質閘門、全文擷取、來源移除、首頁新聞與導流 |
| 02 | [新聞圖片管線](domains/02-news-images.md) | 13 | 四層漏斗、官方向量封面、圖庫備援與冷卻、回填 |
| 03 | [新聞地標與地理萃取](domains/03-news-geo-landmark.md) | 8 | 地標瀑布規則、唯一性、368 鄉鎮、回填 |
| 04 | [資訊架構、導覽、工具平台與公民友站](domains/04-ia-navigation-civic.md) | 14 | 分類、Navbar／Footer、分頁、零空白、健康巡檢、友站 |
| 05 | [醫療、急救與食藥工具](domains/05-tools-medical-food.md) | 12 | 診所、急診、AED、長照 GIS、食安、藥品、醫事性平 |
| 06 | [社福、NPO、兒少家庭與文化工具](domains/06-tools-welfare-family-culture.md) | 20 | 伯公、身障、庇護工場、NPO、TDX 樂齡、兒少、藝文、文資 |
| 07 | [防災、水情、環境與能源工具](domains/07-tools-disaster-environment-energy.md) | 15 | 防災地圖、淹水、停水、氣象、電力、中油、緊急電話、防災物資 |
| 08 | [設施資料、地理編碼與地圖技術](domains/08-facilities-geocode-maps.md) | 13 | TGOS、OpenCage、地址正規化、地圖控制器 |
| 09 | [資料庫與資料正確性](domains/09-database-data-integrity.md) | 10 | UNIQUE KEY 膨脹事故、ensureSchema、zod |
| 10 | [排程、同步與 CI/CD](domains/10-scheduling-sync-ci.md) | 7 | node-cron、GitHub Actions 排程表、部署 |
| 11 | [主機、維運與事故](domains/11-hosting-ops-incidents.md) | 14 | NPROC、PM2、watchdog、WASM OOM、Cloudflare |
| 12 | [前端穩定性與側欄小工具](domains/12-frontend-stability.md) | 9 | React #418、側欄重構、App 內建瀏覽器橫幅 |
| 13 | [SEO、效能、多語系、AI 友善與授權](domains/13-seo-performance-i18n-ai.md) | 15 | Lighthouse、JSON-LD、llms.txt、ja／ko、臺、授權、UTM |
| — | [architecture.md](architecture.md) | 1（取代 SPECIFICATION.md） | 系統總覽 |

狀態圖例（各文件通用）：✅ 已上線（已核對程式碼）｜🟡 部分完成｜❌ 未實作／仍開放｜🗄️ 已取代或撤銷｜📚 研究／診斷｜⛔ 受阻

## 跨領域待辦彙整（核對後仍未完成）

> 2.0 範圍內的項目（搜尋、導覽、合併、交叉連結、套件、Node 24、底圖、UTM 覆蓋率等）統一追蹤於 [Issue #438](https://github.com/j172/health/issues/438)，此處不重複。

| 優先 | 代號 | 項目 | 文件 |
|---|---|---|---|
| **高** | DB-1 | `schema.ts` 建表 DDL 仍是舊的寬 UNIQUE KEY；資料庫重建後 4 張表會再度無限膨脹（重演 2026-09-21 全站中斷） | [09](domains/09-database-data-integrity.md) |
| **高** | O-1 | httpClient 每次 HTTPS 請求重建 TLS SecureContext，記憶體壓力下 `std::bad_alloc` 崩潰（#401 OPEN） | [11](domains/11-hosting-ops-incidents.md) |
| **高** | T-1 | `npm test` 會執行健保懲處匯入器：`scripts/verify-nhi-penalties.test.mjs` import 了 `scripts/import-nhi-penalties.mjs`，後者在最外層呼叫 `main()` → 每次測試都連網下載並覆寫 `data/facilities-seeds/nhi-penalties.json`，若環境有 `ADMIN_SECRET` 還會推送正式 API。修法：腳本加 `if (import.meta.url === pathToFileURL(process.argv[1]).href)` 守衛 | [05](domains/05-tools-medical-food.md) |
| **高** | W-1 | TDX 樂齡 API base path 未確認，`accessible-transit`（#730 起以靜態種子為主，只剩電梯停用公告用 TDX）與 `senior-friendly`（#729 起只剩敬老卡補助，靜態資料）實際跑種子資料。**2026-10-12 已找到正確路徑**（`/api/seniors/V1/Senior`），修正在分支 `fix/tdx-seniors-base-path`，待合併部署後實測；研究見 [2.0/tdx-basic-integration-research.md](2.0/tdx-basic-integration-research.md) | [06](domains/06-tools-welfare-family-culture.md) |
| 中 | I-1 | 新聞內頁 JSON-LD 圖片卡在通用來源圖（疑 ISR 時序） | [02](domains/02-news-images.md) |
| 中 | D-1 | NCDR 全類別示警只有後端，沒有前端分頁 | [07](domains/07-tools-disaster-environment-energy.md) |
| 中 | DB-2 | `migrations/*.sql` 沒有套用紀錄表 | [09](domains/09-database-data-integrity.md) |
| 中 | G-1 | 地標精確度分級未做（內頁地圖已移除，需重新評估價值） | [03](domains/03-news-geo-landmark.md) |
| 中 | — | 只有 33／84 個工具可被索引，2.0 分類頁與 hub 規劃時需納入考量 | [architecture](architecture.md) |
| 低 | I-2、O-2 | Issue #419、#391、#394 程式已上線但 issue 未關 | [02](domains/02-news-images.md)、[11](domains/11-hosting-ops-incidents.md) |
| 低 | N-1 | Google News `site:` 代理仍有 11 筆，持續依新鮮度淘汰 | [01](domains/01-news-sources.md) |
| 低 | N-2 | 運動部新聞需客製爬蟲做日期截斷 | [01](domains/01-news-sources.md) |
| 低 | W-2 | 文資局從正式主機的連線未驗證 | [06](domains/06-tools-welfare-family-culture.md) |
| 低 | D-2 | 本機殘留空目錄（dengue 等，已列入 2.0 P0 清理） | [07](domains/07-tools-disaster-environment-energy.md) |
| 受阻 | M-1 | 藥品仿單無官方結構化來源 | [05](domains/05-tools-medical-food.md) |
| 受阻 | N-3 | 健保署封鎖資料中心 IP | [01](domains/01-news-sources.md) |
| 外部 | O-4 | 共享主機鄰居搶 CPU | [11](domains/11-hosting-ops-incidents.md) |

## 撰寫新文件的規則

1. 新的 spec 直接放 `docs/2.0/`（2.0 範圍）或在對應領域文件新增一節；**不要再建立散落的 `docs/specs/*.md`**。
2. 每份 spec 標明：日期、狀態、issue／PR、已拍板的決策。
3. 上線後回到領域文件把狀態改成 ✅，並更新「目前真相」與「待辦」。
4. 站內頁面連結使用完整網址 `https://health.j172.tw/...`；外部連結若出現在網站上，必須經 `appendOutboundUtm()`。

## 原始文件（已移出工作樹）

2026-10-12 整併前的 190 份原始文件原放在 `docs/archive/`；2026-10-21 專案整理時已刪除，完整內容保留在 git 歷史。程式碼註解裡仍寫著的 `docs/archive/...` 路徑，指的就是這些檔案：

```
git show docs-archive-2026-10-21:docs/archive/specs/<檔名>.md
```

標籤 `docs-archive-2026-10-21` 指向刪除前的最後一個 commit。要找某份原始文件對應到哪份領域文件，用 `git grep` 搜關鍵字即可；每份領域文件都已收錄其內容與狀態。
