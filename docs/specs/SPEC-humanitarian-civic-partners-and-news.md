# 規格書：國際人道援助與人權行動公民友站落地、NEWS 擴充與 Claude API 智慧雙向整合

- **建立日期**：2026-10-24
- **狀態**：Ready for Implementation (`ready-for-agent`)
- **關聯研究**：[`docs/2.0/opendata-expansion-research.md`](../2.0/opendata-expansion-research.md)、[`docs/specs/SPEC-civic-partners-and-opendata-matrix.md`](SPEC-civic-partners-and-opendata-matrix.md)
- **牽涉範疇**：首頁公民夥伴卡片（CivicPartnersSection）、全站頁尾（SiteFooter）、導覽模型（NavModel）、多國語系字典（Locales）、NEWS 擷取管線（RSS/Scraper/sourceCategories）、工具情境導流（NPO 與全球動態地球）、Claude AI 智慧串接與預算熔斷機制

---

## 1. Problem Statement

在當前地緣衝突頻傳、跨國人道危機與複合式資訊戰交織的環境下，臺灣作為印太民主前線與國際公民社會重要一員，本站使用者在獲取「人道救援、人權行動與資訊防衛」時面臨以下痛點：

1. **國際人道與全球人權行動入口缺位**：
   - 本站既有「公民倡議與社會守護」專區已涵蓋開源（g0v）、民防（黑熊學院）、通訊韌性（海纜地圖）與各類裁罰查詢，但全站完全缺乏「國際人道危機醫療救援」、「全球緊急人權連署倡議」與「海外發展援助」的權威民間入口。
   - 民眾面對烏克蘭、中東或全球重大天災人禍時，在關注全球動態之餘，缺乏具公信力、即時且具備正體中文指引的行動管道。
2. **正體中文資訊過濾與非正體來源排除機制**：
   - 國際救援組織（如 IRC 國際救援委員會 rescue.org）主要僅提供英文與其他外語，缺乏在地正體中文支持；硬性收錄會造成臺灣一般民眾的語言障礙與資訊落差，必須確立「具備正體中文資訊才放」之嚴格篩選基線。
3. **動態資訊與靜態行動混雜的產品架構痛點**：
   - 國合會、無國界醫生、特赦組織等機構兼具「即時新聞稿」與「常態性行動/連署專區（如 `take-action`）」。若將靜態連署硬塞入新聞流，或將突發醫療救援動態鎖在靜態頁尾，皆無法發揮最佳導流價值。
4. **既有友站動態未被有效轉化為免疫資訊**：
   - 既有友站「反認知作戰教育網（`cw.yueyuknows.com`）」常態發布深度資訊戰與認知操弄手法拆解，但過去僅作為頁尾單向外部連結，未能進入本站 NEWS 體系為全站讀者建立認知防禦力。
5. **新聞與工具缺乏語意互聯，AI 預算缺乏安全護欄**：
   - 使用者在閱讀前線人道新聞時無法直接切換至相關工具（如全球災害地圖），在操作工具時亦看不到即時行動動態。此外，引入 Claude API 時若缺乏嚴格快取與日額限制，極易在批次排程時引發預算暴衝。

---

## 2. Solution

本規格書拍板採行 **「雙軌分流 ＋ 核心友站擴充 ＋ 雙向 AI 語意整合」** 的全方位解決方案：

### 2.1 雙軌分流架構
1. **動態資訊進 NEWS 系統**：
   - **國合會（TaiwanICDF）**：納入 `gov`「官方機構」分類，展現其法定公設外援機構權威性。
   - **無國界醫生台灣（MSF Taiwan）**：納入 `npo`「公益社福」分類（醫療人道救援）。
   - **國際特赦組織台灣分會（Amnesty Taiwan）**：納入 `npo`「公益社福」分類（人權倡議焦點）。
   - **反認知作戰教育網（既有友站升格）**：納入 `npo`「公益社福／公民倡議」分類（與黑熊學院、報導者同列）。
2. **常態行動與資源進公民友站與工具導流**：
   - **首頁公民夥伴（CivicPartnersSection）擴充 3 大核心 NGO**：無國界醫生台灣、國際特赦組織台灣分會、Taiwan AID 台灣海外援助發展聯盟（代表 30+ 臺灣海外 NGO）。
   - **國合會（TaiwanICDF）**：納入頁尾官方資源連結，並在工具端以官方對外援助代表深度導流。
   - **嚴格排除非正體中文來源**：IRC（rescue.org）因無正體中文資訊，正式予以排除。

### 2.2 雙核心場景深度情境導流卡片
1. **場景一（公民公益大本營）`/tools/npo-organizations`**：
   - 增設「全球人權連署與海外人道援助」專題導流卡片，指引特赦組織 `take-action` 緊急連署、Taiwan AID 聯盟與國合會外派志工管道。
2. **場景二（全球危機圖資）`/tools/global-watch`**：
   - 在全球地震、海嘯與國際疫情監控情境下，增設「全球前線緊急醫療與人道救援」卡片，導流無國界醫生前線救援專題與國合會海外急難救助。

### 2.3 NEWS 抓取技術與適配
1. **標準 RSS/Atom 端點**：國合會與國際特赦組織直接走現行 RSS Ingestion Pipeline。
2. **專用輕量 Cheerio 爬蟲**：為無公開 RSS 的無國界醫生台灣與反認知作戰教育網撰寫專屬 HTML 解析器，容錯處理避免阻塞主排程。
3. **Taiwan AID 策略**：因更新頻率低（按月），專注於友站卡片與情境導流，免除脆弱爬蟲維護成本。

### 2.4 Claude API 智慧雙向串接與 \$100/月 預算風控
1. **雙向語意錨定（News ↔ Tools Linking）**：
   - 新聞入庫時由輕量模型（Claude 3.5 Haiku）判定關聯工具（如無國界醫生新聞自動錨定 `/tools/global-watch`；特赦組織連署錨定 `/tools/npo-organizations`）。
   - 新聞頁帶出互動工具卡，工具頁聚合最新關聯新聞。
2. **AI 行動焦點快報（Action Digest）**：
   - 於工具情境區頂部由 Claude 定期提煉 60 字精華快報與直達行動按鈕。
3. **\$100 預算熔斷機制（Budget Guard）**：
   - **內容 Hash 比對**：未變動內容 100% 走快取，永不重複呼叫。
   - **單日熔斷防護（\$2.8/日）**：單日 token 達到上限即平滑降級為規則比對，嚴格守護每月 \$100 美金上限。

---

## 3. User Stories

1. **作為關注國際人道危機的臺灣公民**，我希望在首頁公民倡議專區看到「無國界醫生台灣」卡片，以便快速前往官方網站了解醫療志工與前線援助專案。
2. **作為積極參與公共議題的公民倡議者**，我希望點擊「國際特赦組織台灣分會」卡片能直接抵達「採取行動（take-action）」連署頁，以便在第一時間為良心犯與人權受害者發聲。
3. **作為有志參與海外援助的青年與非營利從業者**，我希望在首頁看到「Taiwan AID 台灣海外援助聯盟」，以便掌握全臺 30 多家國際 NGO 的聯合網絡與招募管道。
4. **作為查詢 NPO 團體的民眾**，我在使用 `/tools/npo-organizations` 時希望看到國際人道倡議導流卡，以便了解除了國內慈善，還有哪些跨國援助專案可以參與。
5. **作為關注全球震災與突發疫情的使用者**，我在使用 `/tools/global-watch` 時希望看到無國界醫生與國合會的危機應變入口，以便在獲知災情時能即時採取行動或捐助。
6. **作為習慣閱讀本站新聞的讀者**，我希望在 NEWS 列表中看到標記為「官方機構」的國合會新聞，獲知臺灣推動官方對外技術合作與國際醫療援助的最新成果。
7. **作為關注假訊息防衛的公民**，我希望在 NEWS 中閱讀「反認知作戰教育網」的深度分析，強化對境外資訊操弄手法的免疫力。
8. **作為視障或使用螢幕閱讀器的輔助科技使用者**，我希望新增的 3 個公民夥伴外聯符號對螢幕閱讀器隱藏，並以「（另開新視窗）」清晰朗讀。
9. **作為英語/日語/韓語使用者**，我希望新增的夥伴在多國語系介面下皆有在地化的名稱與標籤，確保國際友人亦能順暢閱覽。
10. **作為平臺維運者**，我希望 Claude API 具備單日 \$2.8 美金與 Hash 快取防線，確保每月的智慧串接花費嚴格控制在 \$100 預算以內。

---

## 4. Implementation Details

### 4.1 公民夥伴卡片資料契約（`components/Common/CivicPartnersSection.tsx`）

在 `CIVIC_PARTNERS` 陣列新增以下 3 項：

```typescript
{
  id: "msf-taiwan",
  name: "無國界醫生（台灣）",
  url: "https://www.msf.org.tw/",
  icon: "🩺",
  badge: "醫療人道",
  badgeColor: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800",
  tag: "前線醫療 ‧ 危機救援",
  description: "獨立國際醫療人道救援組織在臺辦公室，為受武裝衝突、流行病與天災影響的脆弱人群提供即時醫療救助。",
},
{
  id: "amnesty-taiwan",
  name: "國際特赦組織台灣分會",
  url: "https://www.amnesty.tw/take-action",
  icon: "🕯️",
  badge: "人權倡議",
  badgeColor: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/60 dark:text-yellow-300 dark:border-yellow-800",
  tag: "人權守護 ‧ 緊急連署",
  description: "全球最大人權運動在臺分會，推動全球緊急人權個案連署、人道救援倡議與人權教育。",
},
{
  id: "taiwan-aid",
  name: "台灣海外援助發展聯盟",
  url: "https://www.aid.org.tw/",
  icon: "🤝",
  badge: "海外援助",
  badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  tag: "國際人道 ‧ NGO網絡",
  description: "匯聚臺灣近 30 個從事國際人道援助與發展合作之非政府組織，推動跨國合作與永續發展網絡。",
}
```

### 4.2 頁尾與導覽模型（`lib/server/tools/navModel.ts`）

在 `CIVIC_PARTNER_LINKS` 增列：
- `{ href: "https://www.msf.org.tw/", label: "無國界醫生（台灣）" }`
- `{ href: "https://www.amnesty.tw/take-action", label: "國際特赦組織台灣分會" }`
- `{ href: "https://www.aid.org.tw/", label: "台灣海外援助發展聯盟" }`
- `{ href: "https://www.icdf.org.tw/", label: "國際合作發展基金會" }`

夥伴總數由 10 個調整為 13（夥伴卡片）/ 14（含國合會頁尾外鏈）。

### 4.3 多國語系字典擴充（`locales/{zh-TW,en,ja,ko}.json`）

新增以下對應鍵值：
- `footer.msfTaiwan`:
  - `zh-TW`: "無國界醫生（台灣）"
  - `en`: "Doctors Without Borders Taiwan"
  - `ja`: "国境なき医師団 台湾"
  - `ko`: "국경없는의사회 대만"
- `footer.amnestyTaiwan`:
  - `zh-TW`: "國際特赦組織台灣分會"
  - `en`: "Amnesty International Taiwan"
  - `ja`: "アムネスティ・インターナショナル台湾"
  - `ko`: "국제앰네스티 대만지부"
- `footer.taiwanAid`:
  - `zh-TW`: "台灣海外援助發展聯盟"
  - `en`: "Taiwan AID"
  - `ja`: "台湾海外援助発展連盟"
  - `ko`: "대만해외원조발전연맹"
- `footer.icdf`:
  - `zh-TW`: "國際合作發展基金會"
  - `en`: "TaiwanICDF"
  - `ja`: "国際合作発展基金会"
  - `ko`: "국제협력발전기금회"

### 4.4 NEWS 分類註冊（`lib/server/news/sourceCategories.ts`）

1. 在 `gov` 官方機構分類新增：
   - `{ sourceName: "icdf", label: "國合會" }`
2. 在 `npo` 公益社福分類確認並新增：
   - `{ sourceName: "amnesty", label: "國際特赦組織台灣分會" }`（復用既有）
   - `{ sourceName: "msf", label: "無國界醫生台灣" }`
   - `{ sourceName: "anti_cw", label: "反認知作戰教育網" }`

### 4.5 Claude API 智慧整合守護模組（`lib/server/ai/claudeBudgetGuard.ts`）

```typescript
export interface AiBudgetUsage {
  dailyEstimatedCostUsd: number;
  maxDailyCostUsd: 2.8; // Monthly limit $100 -> $2.8/day safety margin
  isCircuitBroken: boolean;
}
```
- 入庫文章比對 `payload_hash`，已處理過的文章直接跳過。
- 單日費用超過 \$2.8 時觸發熔斷，降級為靜態規則比對，防止任何爬蟲或批次異常突破 \$100 上限。

