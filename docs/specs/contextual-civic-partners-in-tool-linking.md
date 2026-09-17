# 公民倡議友站情境式工具深度聯動規格說明書 (Contextual In-Tool Deep Integration)

## 1. 緣起與目標

本站（`health.j172.tw`）陸續完成黑熊學院民防新聞與藝文活動整合、g0v 零時政府官方日曆同步，以及首頁和工具目錄之「公民倡議與社會守護」專區展示。
為深化與 5 大友站（台灣罪犯圖鑑、黑熊學院、反認知作戰教育網、g0v 零時政府、2026 政治人物前科查詢）的實質連結，讓公民倡議不只是被動展示，而是在民眾使用具體公共與生活工具時「情境式觸發」，提供互補互信的專業查核與民防倡議引導。

本規格依據正體中文 **GRILL ME** 嚴格審定共識制定。

---

## 2. GRILL ME 審定核心決策

1. **核心型態**：情境式工具深度聯動（Contextual In-Tool Deep Integration），在具體任務情境內提供精準的指引與跳轉。
2. **UI 展現**：常駐微型橫幅卡片（`ContextualPartnerCard`），放置於工具頁面標題下方、主要搜尋篩選控制區上方。
   - 採用半透明玻璃態與微細邊框，自然融入工具頁面層級。
   - 保持非侵入式常駐（Non-intrusive Permanent），不設關閉叉叉按鈕，視為官方延伸權威提示。
3. **外連機制**：
   - 使用新分頁開啟（`target="_blank" rel="noopener noreferrer"`）。
   - 攜帶乾淨友善之來源參數：`utm_source=health.j172.tw&utm_medium=contextual_banner&utm_campaign=civic_partner`，協助友站識別合作流量。

---

## 3. 工具與友站情境落地配對矩陣

| 友站名稱 | 核心倡議使命 | 目標工具頁面 | 情境標題與行動呼籲文案 |
| :--- | :--- | :--- | :--- |
| **台灣罪犯圖鑑** (`metawilo`) | 兒少校園保護、性犯罪前科透明化 | `/tools/kindergartens`<br>`/tools/cram-schools`<br>`/tools/child-safety-spots` | 守護孩童與校園安全：除政府立案資格與警示點外，建議搭配台灣罪犯圖鑑查核司法判決紀錄 ↗ |
| **黑熊學院** (`kuma`) | 全民防衛韌性、急救訓練、避難準備 | `/tools/disaster-map`<br>`/tools/earthquakes`<br>`/tools/aed`<br>`/tools/er-status` | 全民防衛自主應變：除避難處所與急救醫療查詢，可前往黑熊學院學習急救止血、避難包準備與民防應變 ↗ |
| **反認知作戰教育資源網** (`anti-cw`) | 資訊戰防衛、假訊息辨識、數位免疫力 | `components/News/NewsSidebar.tsx`<br>新聞閱讀與查核推薦區 | 建立數位免疫力：閱讀即時新聞時，前往反認知作戰教育資源網提升假訊息與資訊戰辨識能力 ↗ |
| **g0v 零時政府** (`g0v`) | 開源公民科技、黑客松、跨界協作 | `/tools/cultural-events` | 開源公民協作：參與 g0v 零時政府黑客松與專案小聚，以公民科技推動社會變革 ↗ |
| **2026 政治人物前科查詢** (`council2026`) | 陽光政治、民意代表司法紀錄公開 | `/tools/npo-organizations` | 陽光政治與公眾監督：除公益團體法人名錄，前往 2026 政治人物前科查詢監督民意代表司法紀錄 ↗ |

---

## 4. 前端組件架構

### `components/Common/ContextualPartnerCard.tsx`
- **Props**:
  - `partnerId`: `"metawilo" | "kuma" | "anti-cw" | "g0v" | "council2026"`
  - `contextTitle?`: string（覆蓋預設標題）
  - `contextDescription?`: string（覆蓋預設說明）
  - `targetSubpath?`: string（可指定直達子頁面，如 `/calendar` 或特定分類）
  - `className?`: string
- **特性**:
  - 精簡行距、高對比易讀。
  - 完美適應深色（Dark Mode）與淺色主題。
  - 提供輔助技術無障礙標籤（`aria-label`）。

---

## 5. 驗證與自動化測試

1. **單元測試**：`components/Common/ContextualPartnerCard.test.mjs`
   - 驗證各 partner 預設屬性是否正確。
   - 驗證 UTM 參數組合格式。
2. **全域測試**：`npm test` 確保既有 296+ 測試無任何破壞性變更。
3. **型別檢查**：`npm run typecheck`。
