# 2.0 PRD（Issue #438 正文副本）

> 正本：[GitHub Issue #438](https://github.com/j172/health/issues/438)（標籤 `ready-for-agent`）。本檔為 2026-10-12 的副本（含 TDX、多語系支援、SEO／AEO／GEO、每頁 llms.txt、Cloudflare 擴充），若兩者不同以 issue 為準。

> 來源：2026-10-12 規劃＋/grill 共 24 項決策，以及同日追加的 TDX 資料整合（§P）與多語系支援、SEO／AEO／GEO／Schema.org、每頁 llms.txt、Cloudflare 免費方案整合（§Q–§T）。完整背景與研究見 repo 內 2.0 master plan 與 TDX 研究文件。本 spec 為 PRD，實作時再以 `/to-tickets` 拆成分期 issue。
> 盤點基準：`origin/main` @ `7fe098b`（84 個工具）。

## Problem Statement

j172tw Healthz 已累積 84 個便民工具、上萬篇新聞與數十個官方資料源，但使用者「找不到」也「串不起來」：

1. **找不到工具**：Ctrl+K 站內搜尋只搜新聞，84 個工具完全搜不到；Navbar 有 11 個頂層項目，只有在 ≥1280px 螢幕才展開，一般筆電（1024–1279px）全部縮進漢堡選單。
2. **分類不一致又不平均**：Nav／Footer 用 9 類、`/tools` 索引頁自己另有 10 段（其中「藥品食品」段寫死 3 個工具，漏掉 2 個）、README 寫 7 類；「醫療照護機構」17 個工具過肥，「兒少」「藥品食品」各只有 5 個，「公益與生活服務」是雜項桶。分類是依「資料是名冊還是登錄」切的，不是依「使用者是誰、遇到什麼事」。
3. **Footer 過載**：11 欄、約 95 個連結，與 Nav 完全重複。
4. **工具彼此是孤島**：19 個工具沒有任何站內連結指向它；4 處相關連結指向 noindex 的重複頁；`funeral-facilities` 的相關連結寫成分類名稱（壞連結）；新聞與工具之間完全沒有互相連結。
5. **重複頁面**：`ltc-contracted`（noindex 重複頁）、`green-shops`（與 `green-certifications` 的「綠色商店」分頁使用同一份資料）；中油油價與加油站、長照四個名冊頁，使用者情境相同卻拆成多頁。
6. **首頁看不到核心產品**：首頁是純新聞版型，工具只出現在側欄；10 個側欄 widget 各自打 API，首頁一次載入 10 個請求，加重主機（768MB、20 Entry Processes）負擔。
7. **地圖有封鎖風險且重複實作**：9 個各自獨立的地圖元件，全部寫死 `{s}.tile.openstreetmap.org`，違反 OSMF 圖磚政策「勿寫死、子網域可能撤除、可無預警封鎖」的建議。
8. **技術債**：Node 20 已於 2026-04-30 EOL，正式環境仍跑 v20.20.2；`swiper`、`sharp` 零使用仍在相依；`iconv-lite`、`segmentit`、`framer-motion`、`react-hot-toast` 都有更輕的內建／自寫替代；25 個檔案各自呼叫定位 API（曾因此出現 4 處各自修的 timeout bug）；23 個 SaaS 樣板殘留空目錄。
9. **外連追蹤不完整**：UTM 函式已存在，但只有 6 個檔案使用；20 個寫死外連與 catalog 內 139 個科學依據外連都沒有 UTM。
10. **i18n 缺漏**：en／ja／ko 只翻譯了 60／84 個工具名稱，其餘在外語介面顯示中文。
11. **無障礙與交通資料是假的或不完整**：無障礙交通頁的「低地板公車比率」是寫死的種子值；捷運公告只有臺北捷運；YouBike 只接了 TDX 15 個縣市中的 5 個；站上沒有任何有聲號誌或身障／孕婦親子車位資料——而這些 TDX 基礎服務都有提供。
12. **外語版本對搜尋引擎不存在**：`hreflang` 宣告 `?lang=en`／`ja`／`ko` 版本，但語言切換完全在瀏覽器端進行，伺服器永遠輸出中文（實測 Googlebot 抓 `/tools/aed?lang=en` 得到 `<html lang="zh-Hant-TW">` 與中文標題）。外語內容也只翻到名稱，使用者看不懂說明與 FAQ。
13. **AI 爬蟲被擋**：`robots.txt` 明確允許 GPTBot、ClaudeBot，但 Cloudflare 的 AI 機器人防護實際回 403（PerplexityBot 卻回 200）；站上的 llms.txt 與 GEO 投資等於無效。llms.txt 也只有全站一份，沒有每頁的 Markdown 版本。
14. **Cloudflare 設定靠手動點選**：除了 Smart Tiered Cache 有一支手動 workflow，其餘規則都只存在儀表板，無版本紀錄、無法回溯；站上另有自寫 IndexNow（曾因全域 `fetch` 造成 502），而 Cloudflare 免費的 Crawler Hints 可自動完成同一件事。

## Solution

以「使用者情境」重建資訊架構，並把導覽、分類頁、情境頁、搜尋、sitemap 全部改由單一 catalog 推導：

- **7 個工具分類**（每類 9–13 個），各有分類落地頁 `/tools/category/[slug]`，工具頁既有麵包屑加入分類層級。
- **Navbar 5 項**：新聞｜工具▾（mega menu 列出全部工具＋搜尋框）｜生活情境▾｜我附近｜🚨緊急，≥1024px 即完整展開；手機加 5 格底部導覽列。
- **Footer 4 欄約 24 連結**：關於本站／7 分類／5 情境／公民友站。
- **5 個生活情境 hub** `/guides/[slug]`：以步驟串起跨分類工具。
- **「我附近」頁**：一次定位，列出 8 類急用點位最近 3 筆，可展開更多類型。
- **Ctrl+K 搜尋涵蓋工具**；新聞與工具雙向連結；所有工具至少 2 個入站連結。
- **合併 5 個重複／同情境頁面**（84 → 79 個工具），舊網址 301。
- **首頁改為「今日狀態列＋情境入口＋最近使用工具＋新聞」**，資料改由 1 支 snapshot API 提供。
- **工具頁重排**：「下一步」與相關新聞上移，長內容收合。
- **統一地圖底層**，預設國土測繪中心 EMAP，OSM 為備援。
- **減少 6 個套件相依**、統一定位 hook、升級 Node 24 LTS、清除空目錄。
- **全站外連 100% 帶 UTM**。
- **指定頁面真正多語系**：約 21 個高流量頁面提供 `/en/`、`/ja/`、`/ko/` 網址，伺服器直接輸出該語言，介面與內容全翻、政府資料保留原文。
- **SEO／AEO／GEO／Schema.org 全面到位**：每種頁面類型都有完整結構化資料、一句話答案與 FAQ；AI 爬蟲三類全部放行。
- **每一頁都有自己的 `llms.txt` 與 `.md` 全文**（含外語版）。
- **Cloudflare 免費方案設定即程式碼**：快取、標頭、WAF、AI 爬蟲政策、Crawler Hints、Web Analytics、靜態圖轉換全部由 repo 管理。
- **接上 TDX 真實交通無障礙資料**：低地板公車比率、盲人有聲號誌、身障／孕婦親子／復康巴士車位、全台軌道營運通阻、YouBike 全 15 縣市；餵給既有工具、生活情境 hub 與「我附近」，不新增工具頁。

## User Stories

### 找工具與導覽
1. 身為筆電使用者（螢幕 1024–1279px），我想直接在頂部導覽看到完整選單，以便不用點開漢堡選單就能找到工具。
2. 身為使用者，我想在 Ctrl+K 搜尋框輸入「血壓」就找到血壓計算器，以便不用知道它被放在哪個分類。
3. 身為使用者，我想用俗稱搜尋（例如「心臟電擊」找到 AED、「肥胖」找到 BMI），以便不用知道官方名稱。
4. 身為使用者，我想在搜尋結果中把工具排在新聞前面並分區顯示，以便快速分辨「可以操作的工具」和「可以閱讀的新聞」。
5. 身為使用者，我想打開「工具▾」時一眼看到 7 個分類的全部工具，以便掌握本站能做什麼。
6. 身為使用者，我想在 mega menu 頂部直接輸入關鍵字過濾，以便在近 80 個工具中快速縮小範圍。
7. 身為使用者，我想點分類標題進入分類落地頁，以便看到該分類每個工具的說明再決定用哪個。
8. 身為使用者，我想在工具頁看到「首頁 › 分類 › 工具」麵包屑，以便知道自己在哪裡、回到同類工具。
9. 身為鍵盤使用者，我想用 Tab／方向鍵／Esc 操作 mega menu，以便不用滑鼠也能導覽。
10. 身為螢幕閱讀器使用者，我想 mega menu 有正確的 ARIA 角色與標籤，以便理解選單結構。
11. 身為手機使用者，我想用拇指點底部導覽列的「首頁／工具／我附近／緊急／搜尋」，以便單手操作。
12. 身為手機閱讀新聞的使用者，我想往下捲動時底部導覽自動隱藏、往上捲時出現，以便閱讀空間不被佔用。
13. 身為使用者，我想 Footer 簡潔地列出分類、情境與友站，以便在頁尾快速跳轉而不是面對近百個連結。
14. 身為 en／ja／ko 使用者，我想 Nav、Footer、分類、情境、工具名稱全部以我的語言顯示，以便不會看到夾雜的中文。
15. 身為使用者，我想所有分類與分類內工具依一致的筆畫規則排序，以便每次都在相同位置找到它。

### 分類落地頁
16. 身為使用者，我想在分類頁看到每個工具的一句話說明（directAnswer），以便快速判斷用途。
17. 身為使用者，我想在分類頁看到這個分類相關的生活情境 hub 入口，以便從單一工具跳到完整流程。
18. 身為搜尋引擎使用者，我想用「長照資源查詢」這類大詞搜尋時找到對應分類頁，以便一次看到所有相關工具。
19. 身為站長，我想每個分類頁都有 `CollectionPage`／`ItemList` 與 `BreadcrumbList` 結構化資料，以便搜尋結果呈現更完整。

### 生活情境 hub
20. 身為家中有長輩的照顧者，我想打開「家有長輩」頁，依步驟看到長照照顧圈、敬老／樂齡、無障礙交通、助聽器補助、居家急救，以便一次弄清楚能用的資源。
21. 身為準父母，我想在「懷孕到育兒」頁依序看到母嬰親善醫院、哺集乳室、幼兒園、兒少福利機構、兒童安全地點，以便規劃每個階段。
22. 身為颱風或地震期間的居民，我想在「颱風地震來了」頁依序看到氣象警報、地震、避難地圖、淹水、停水、防災物資、緊急電話，以便在緊張時照著步驟做。
23. 身為身心障礙者或家屬，我想在「身心障礙者生活」頁看到福利機構、庇護工場、無障礙 ATM、無障礙交通、公廁，以便規劃日常生活。
24. 身為準備出國的人，我想在「出國與防疫」頁看到國際旅遊疫情、成人預防保健、診所、藥局，以便出發前做好準備。
25. 身為使用者，我想 hub 每一步都是一張可直接點進工具的卡片，並附一句說明「為什麼這一步」，以便理解流程。
26. 身為使用者，我想在 `/guides` 看到全部 5 個情境的索引，以便選擇符合自己狀況的那一個。
27. 身為使用者，我想在工具頁看到「這個工具屬於哪些生活情境」，以便從單點跳到完整流程。
28. 身為站長，我想 hub 頁有 `ItemList`／`HowTo` 結構化資料與 FAQ，以便在搜尋結果曝光。

### 我附近
29. 身為在外地的人，我想按一次「我附近」就看到最近的 AED、急診、藥局、診所、避難所、公廁、涼適點、無障礙 ATM，以便緊急時不用逐一開工具。
30. 身為使用者，我想每類只看最近 3 筆並標示距離，以便快速決定去哪裡。
31. 身為使用者，我想看到急診的即時等候量能（若有資料），以便選擇較不擁擠的醫院。
32. 身為使用者，我想展開「更多類型」看到長照、幼兒園、動物醫院等其他點位，以便需要時查詢但平時不干擾。
33. 身為使用者，我想點任一點位進入對應工具並以我的位置為中心，以便看到更完整的列表與地圖。
34. 身為拒絕定位授權的使用者，我想改選縣市／鄉鎮或輸入地址，以便仍能使用。
35. 身為使用者，我想定位授權只問一次並在全站共用，以便不會每頁都被詢問。
36. 身為慢速網路使用者，我想定位逾時不會靜默把我放到台北 101，而是明確提示我手動選擇，以便不被誤導。

### 交叉連結
37. 身為閱讀登革熱新聞的讀者，我想在文末看到病蟲害預警與國際旅遊疫情工具卡，以便立即採取行動。
38. 身為閱讀地震新聞的讀者，我想看到地震查詢、防災物資計算與避難地圖，以便做好準備。
39. 身為工具使用者，我想在工具頁看到 3 則最新相關新聞，以便了解這個主題的最新動態。
40. 身為使用者，我想每個工具頁至少有 4 個相關工具推薦，以便探索相關資源。
41. 身為使用者，我想在地圖點位彈出視窗中點「看附近的 AED／急診／藥局」，以便從一個機構延伸查詢周邊資源。
42. 身為站長，我想任何工具都至少有 2 個站內入站連結、沒有指向不存在或 noindex 的連結，以便不產生孤兒頁與壞連結。

### 合併頁面
43. 身為曾收藏 `/tools/ltc-contracted`、`/tools/home-healthcare`、`/tools/elder-welfare`、`/tools/hakka-bogong` 的使用者，我想點舊網址被永久轉到「長照照顧圈地圖」並自動選好對應類型，以便收藏不失效。
44. 身為照顧者，我想在「長照照顧圈地圖」一頁用類型篩選長照特約、居家醫療、老人福利機構、伯公照護站，以便不用分開查四個名冊。
45. 身為照顧者，我想切換 1／3／5 公里半徑看到「圈內有 N 個長照資源」，以便理解我家附近的照顧資源密度。
46. 身為使用者，我想清楚看到「直線距離，市區約等於車程 10 分鐘，實際依路況而定」的說明，以便不誤以為是精確車程。
47. 身為鄉村地區使用者，我想在 3 公里內沒有資源時被提示改用 5 公里，以便不會看到空白結果就放棄。
48. 身為加油的人，我想在同一頁切換「本週油價」與「附近加油站」，以便同時知道價格與地點。
49. 身為曾收藏 `/tools/cpc-stations` 或 `/tools/green-shops` 的使用者，我想舊網址被轉到合併頁的對應分頁，以便收藏不失效。
50. 身為搜尋引擎，我想舊網址回傳 301，以便排名權重轉移到新頁面。

### 首頁
51. 身為每天早上開站的使用者，我想在首頁最上方一列看到所在地天氣、AQI、UV、最新地震與警報，以便 3 秒內掌握今日狀況。
52. 身為使用者，我想在首頁看到 5 張生活情境卡，以便從情境進入工具。
53. 身為常用特定工具的使用者，我想首頁顯示「最近使用的工具」，以便一鍵回到常用工具。
54. 身為新聞讀者，我想焦點新聞與新聞列表仍在首頁，以便延續原本的閱讀習慣。
55. 身為使用者，我想首頁某一區資料暫時失敗時只有那一區顯示錯誤狀態，以便其他資訊照常可見。
56. 身為行動網路使用者，我想首頁載入更快，以便在弱網環境也能用。

### 工具頁
57. 身為手機使用者，我想打開工具頁時首屏就是工具本身，以便不用捲過說明文字。
58. 身為使用者，我想算完 BMI 後立刻看到「下一步：體脂、腰臀比、熱量」，以便延伸評估。
59. 身為想深入了解的使用者，我想展開「計算公式」「參考表」「科學依據」「常見問題」，以便查證方法與來源。
60. 身為站長，我想收合區塊的文字仍在 HTML 中、結構化資料不變，以便 SEO 不受影響。

### 身體數據檔案
61. 身為常用健康計算器的使用者，我想勾選「記住我的身高、體重、年齡、性別（只存在這台裝置）」，以便其他計算器自動帶入。
62. 身為重視隱私的使用者，我想此功能預設關閉、需要我主動勾選，以便不在共用電腦上留下資料。
63. 身為使用者，我想一鍵清除已記住的資料，以便隨時撤回。
64. 身為使用者，我想血壓、心率等醫療數值永遠不被記住，以便降低敏感資料外洩風險。
65. 身為使用者，我想在隱私權政策中看到此功能的說明（存放位置、項目、清除方式、不上傳），以便放心使用。

### 地圖
66. 身為使用者，我想所有地圖以正體中文標註、地名與鄉鎮界線和政府資料一致，以便對照官方資訊。
67. 身為使用者，我想主要底圖載入失敗時自動切換備援底圖，以便地圖不會空白。
68. 身為使用者，我想所有地圖有一致的定位按鈕、群聚標記、清單／地圖切換，以便操作方式一致。
69. 身為手機使用者，我想地圖類工具預設顯示清單、可切換地圖，以便在小螢幕上快速瀏覽。
70. 身為使用者，我想每張地圖都清楚標示底圖來源，以便符合授權要求。

### 外連與追蹤
71. 身為站長，我想全站每一個外部連結都帶 `utm_source=health.j172.tw` 與依版位區分的 `utm_medium`／`utm_campaign`，以便合作機構看得到本站導流。
72. 身為站長，我想外連既有的 UTM 參數不被覆蓋，以便尊重上游自己的追蹤設定。
73. 身為站長，我想新增未包裝 UTM 的外連時測試會失敗，以便覆蓋率不再退化。

### 效能與維運
74. 身為站長，我想首頁從 10 個 API 請求降到 1 個，以便降低主機併發與 Entry Process 壓力。
75. 身為站長，我想正式環境升級到仍有安全更新的 Node 24 LTS，並在切換前完成記憶體實測，以便不重演記憶體上限事故。
76. 身為站長，我想移除未使用與可被內建取代的套件，以便減少安裝時間、client JS 與供應鏈風險。
77. 身為開發者，我想全站只有一個定位 hook 與一個地圖底層元件，以便修一次 bug 全站生效。
78. 身為開發者，我想 Nav、Footer、分類頁、hub、搜尋、sitemap、llms.txt 全由同一份 catalog 推導，以便新增或調整工具時不會漂移。
79. 身為開發者，我想清除 SaaS 樣板殘留的空目錄與 README 漂移，以便專案結構反映實際狀態。
80. 身為維運者，我想每期部署後實打 live API 驗證，以便及早發現綠燈測試沒抓到的正式環境回歸。

### TDX 交通無障礙資料（2026-10-12 追加）
81. 身為輪椅使用者，我想看到我所在縣市真實的低地板公車比率，以便判斷搭公車是否可行，而不是看到寫死的數字。
82. 身為輪椅使用者，我想知道某條路線的班次是否使用低地板公車，以便選擇搭得上的那一班。
83. 身為視障者或陪同家屬，我想在「我附近」與「身心障礙者生活」hub 找到最近的盲人有聲號誌路口，以便規劃安全的步行路線。
84. 身為視障者，我想知道該路口能否用 App 觸發有聲號誌並取得 App 下載連結，以便實際使用。
85. 身為孕婦或帶幼兒的家長，我想找到附近有孕婦及親子專用車位的停車場與即時剩餘數，以便出門前知道停不停得到。
86. 身為身障者或家屬，我想找到附近的身心障礙汽車／機車車位與復康巴士車位及即時剩餘數，以便就醫與外出。
87. 身為颱風或地震期間的通勤者，我想在一頁看到臺北、桃園、臺中、高雄捷運、輕軌、貓空纜車、臺鐵、高鐵的營運通阻，以便知道哪些交通停駛。
88. 身為非臺北的捷運使用者，我想在「全台軌道營運通阻」頁看到我所在城市的公告，以便這個工具對我也有用。
89. 身為臺北以外 10 個縣市的 YouBike 使用者，我想查到附近站點的即時車位，以便這個工具在我的城市也能用。
90. 身為站長，我想 TDX 的座標、縣市代碼都經過同一套轉換與對照，以便不同 TDX 資料源之間不會出現格式漂移。

### 多語系支援（2026-10-12 追加）
91. 身為使用者，我想用日文搜尋「台北 AED」就找到日文版 AED 地圖頁，以便在緊急時看得懂。
92. 身為使用者，我想打開韓文版急診看板，看到韓文的說明、狀態與 FAQ，以便判斷該去哪家醫院。
93. 身為使用者，我想醫院名稱與地址保留中文原文並附英文類別標籤與「複製地址」「Google 地圖導航」按鈕，以便拿給計程車司機看或直接導航。
94. 身為使用者，我想在外語頁切換語言時留在同一頁的對應語言版本，以便不必重新找頁面。
95. 身為使用者，我想在中文頁看到「This page is available in English」的提示而不是被自動跳轉，以便自己決定語言。
96. 身為使用者，我想外語版「我附近」與「颱風地震來了」頁同樣完整翻譯，以便在天災時自救。
97. 身為站長，我想舊的 `?lang=en` 網址 301 到 `/en/` 對應頁，以便既有外連與書籤不失效、排名權重轉移。

### SEO／AEO／GEO／Schema.org（2026-10-12 追加）
98. 身為搜尋引擎，我想每種頁面都有正確型別的 JSON-LD（工具、分類頁、hub、我附近、機構、活動、新聞），以便產生複合式搜尋結果。
99. 身為語音助理或 AI 搜尋，我想每頁開頭都有 40–80 字的一句話答案並標記為 speakable，以便直接引用回答使用者。
100. 身為 AI 助理，我想看到每頁的權威依據（政府機關、法規、研究）以結構化 `citation` 呈現，以便判斷可信度並註明來源。
101. 身為站長，我想 Google 搜尋結果出現本站的站內搜尋框（`SearchAction`），以便使用者直接從搜尋結果找工具。

### 每頁 llms.txt 與 Markdown（2026-10-12 追加）
102. 身為 AI 代理，我想讀 `/tools/aed/llms.txt` 就得到該頁的一句話答案、資料來源、相關頁面與 FAQ，以便用最少 token 理解這頁。
103. 身為 AI 代理，我想讀 `/tools/aed.md` 取得整頁乾淨的 Markdown 全文，以便不必解析 HTML。
104. 身為 AI 代理，我想每頁 HTML 都以 `rel="describedby"`（llms.txt）與 `rel="alternate" type="text/markdown"`（.md）宣告機器可讀版本，以便自動發現。
105. 身為外語 AI 代理，我想 `/en/tools/aed/llms.txt`、`/en/tools/aed.md` 也存在，以便用英文內容回答英文使用者。

### Cloudflare 免費方案整合（2026-10-12 追加）
106. 身為 ChatGPT、Claude、Perplexity 等 AI 爬蟲，我想能正常讀取本站（不再被 403），以便引用本站回答使用者。
107. 身為站長，我想所有 Cloudflare 規則都存在 repo 並由 CI 套用、可先看差異再套用，以便變更可追溯、可回退。
108. 身為站長，我想內容更新時 Cloudflare 自動通知搜尋引擎（Crawler Hints），以便拿掉自寫的 IndexNow 程式。
109. 身為站長，我想有一份不受廣告攔截影響、無 cookie 的流量數據，以便交叉驗證 GA 與 Clarity。
110. 身為行動網路使用者，我想 logo、圖示、hub 封面由 Cloudflare 邊緣自動轉成 AVIF／WebP 並縮放，以便更快載入且不增加主機負擔。

## Implementation Decisions

### A. 資訊架構（單一真相來源）
- `ToolGroup` 由 9 類改為 7 類。分類 slug 與名稱：
  | slug | 名稱 | 約數 |
  |---|---|---|
  | `health-assessment` | 健康自我評估 | 12 |
  | `medical-care` | 就醫與用藥 | 13 |
  | `elder-care-welfare` | 長照與社會福利 | 9 |
  | `family` | 婦幼與家庭 | 9 |
  | `disaster-alerts` | 防災與示警 | 13 |
  | `environment-food` | 環境與食品安全 | 11 |
  | `life-culture` | 交通、生活與文化 | 12 |
- 分配（合併後 79 個）：
  - 健康自我評估：bmi, calories, nutrition, water, body-fat, waist-hip, heart-rate, blood-pressure, sleep, stress, lbm, vo2max
  - 就醫與用藥：clinics, pharmacies, er-status, health-checks, adult-preventive-care, mental-health, smoking-cessation, rare-disease-care, organ-donation-hospitals, home-emergency-care, medical-violators, drugs, health-supplements
  - 長照與社會福利：long-term-care（合併後）, disability-welfare, sheltered-workshops, hearing-aid-subsidies, disability-atm, accessible-transit, npo-organizations, funeral-facilities, senior-friendly
  - 婦幼與家庭：baby-friendly-hospitals, breastfeeding-rooms, contraception-map, kindergartens, cram-schools, child-welfare-institutions, child-native-languages, pet-adoption, vet-clinics
  - 防災與示警：earthquakes, weather-alerts, uv, disaster-map, inundation-map, water-outages, water-conditions, emergency-hotlines, emergency-supplies, aed, travel-epidemic-alerts, pest-alerts, child-safety-spots
  - 環境與食品安全：aqi, aqx-monitoring, iaq-premises, outdoor-safety, food-safety, food-operators, food-nutrition, pesticide-sales, cleaning-squads, carbon-footprint, green-certifications
  - 交通、生活與文化：youbike, metro-alerts, cpc-prices（合併後）, power-grid-overview, public-toilets, cool-spots, cultural-events, public-art, heritage-map, bookstores, latest-books, tourism-factories
- 排序沿用 #256 拍板規則：英文名稱在前，中文依首字筆畫由少到多；分類層與工具層各自套用。
- catalog 模組新增一組**純函式導覽模型建構器**（暫名 `buildNavModel`、`buildFooterModel`、`buildCategoryPage`、`buildGuide`、`searchTools`、`buildRedirects`），Nav、Footer、`/tools` 索引、分類頁、hub、搜尋、sitemap、llms.txt 一律呼叫這些函式，不得自行持有分類清單。移除 `/tools` 索引頁的私有分類定義。
- `ToolCatalogEntry` 新增 `keywords: string[]`（俗稱、同義詞、新聞關鍵字），同時供搜尋、新聞↔工具對照與 JSON-LD `keywords` 使用。
- 新增 `GUIDES` 資料結構（hub 定義）：`slug`、標題、說明、有序 `steps[]`（每步：工具 slug、步驟說明、為什麼）、FAQ。
- 分類落地頁網址 `/tools/category/[slug]`；hub 網址 `/guides/[slug]`，索引 `/guides`。hub slug：`caring-for-elders`、`pregnancy-to-parenting`、`typhoon-earthquake`、`disability-living`、`travel-health`。
- 工具頁 `ToolPageShell` 既有麵包屑（目前為「首頁 / 健康工具與公衛資料庫 / 工具」）與 `BreadcrumbList` JSON-LD 改為「首頁 › 工具 › 分類 › 工具」；分類頁用 `CollectionPage`＋`ItemList`；hub 用 `ItemList`＋`FAQPage`。

### B. 導覽 UI
- Navbar 頂層 5 項：新聞｜工具▾｜生活情境▾｜我附近｜🚨緊急；「首頁」移除（Logo 即首頁）。≥1024px 展開。
- 工具 mega menu：7 欄列出全部工具，頂部即時過濾輸入框，分類標題連到分類頁，底部「看全部分類」。符合 WAI-ARIA disclosure navigation 模式（Esc 關閉、焦點管理、外點關閉）。
- 手機：底部固定 5 格（首頁／工具／我附近／緊急／搜尋），新聞內頁向下捲動自動隱藏；尊重 safe-area inset。
- Footer 4 欄：關於本站（首頁、新聞、隱私、無障礙、Hey AI）／工具分類（7）／生活情境（5）／公民倡議與友站（現有 7）。不設熱門工具欄。

### C. 搜尋
- Ctrl+K 模態先在 client 端以 catalog 比對工具（title、navLabel、description、directAnswer、keywords、目前語系翻譯），結果分「工具」「新聞」兩區、工具在上；新聞仍走既有新聞搜尋 API。不引入搜尋套件（Pagefind 與 SSR／ISR 架構不合，已評估排除）。

### D. 合併（皆 301 永久轉址，保留查詢參數對應分頁／類型）
- M1 `ltc-contracted` → `long-term-care`（移除幽靈頁）。
- M2 `green-shops` → `green-certifications?tab=green-shops`（已查證同一份 `green_shop` 資料）。
- M3 `cpc-stations` → `cpc-prices?tab=stations`；`cpc-prices` 改為「本週油價｜附近加油站」分頁。
- M4 `home-healthcare`、`elder-welfare`、`hakka-bogong` → `long-term-care?type=…`；`long-term-care` 頁面標題改為「長照照顧圈地圖」，使用多類型設施查詢（比照 `green-certifications` 的類型分頁做法），伯公照護站點位一併呈現。
  - 照顧圈：地圖疊加可切換 1／3／5 公里直線半徑圈與「圈內 N 個資源」統計，固定附註「直線距離，市區約等於車程 10 分鐘，實際依路況而定」；圈內為 0 時提示擴大半徑。不使用任何路徑規劃服務。
- M5（food-operators 併入 food-safety）**取消**：兩者分別為業者登錄與農藥殘留，只互加相關連結。
- 每個被合併工具：catalog 移除舊條目、重寫合併後條目的 description／directAnswer／scientificBasis／faqs／keywords；更新所有 `relatedSlugs`（目前指向 home-healthcare 6 處、elder-welfare 5 處、ltc-contracted 4 處、hakka-bogong 1 處、cpc-stations 1 處）、sitemap、llms.txt、llms-full.txt、facility configs、i18n。`senior-friendly` 的相關連結改指 `long-term-care`。

### E. 交叉連結
- 相關工具：人工 `relatedSlugs` 優先；不足 4 個時由導覽模型以同分類工具自動補滿。修正 `funeral-facilities` 的 `"life-services"` 壞連結。
- 補齊 19 個零入站工具的入站連結（人工策展，非僅靠自動補滿）：child-native-languages, travel-epidemic-alerts, iaq-premises, cleaning-squads, aqx-monitoring, tourism-factories, health-supplements, sheltered-workshops, mental-health, smoking-cessation, rare-disease-care, organ-donation-hospitals, home-emergency-care, pesticide-sales, hearing-aid-subsidies, funeral-facilities, emergency-supplies, medical-violators（green-shops 因 M2 移除）。
- 新聞內頁：依新聞分類＋標題關鍵字比對 catalog `keywords`，顯示 1–3 張相關工具卡。
- 工具頁：「相關新聞」3 則，以工具 `keywords` 查新聞，伺服器端快取。
- 工具頁顯示「所屬生活情境」連結（由 `GUIDES` 反查）。
- 地圖彈出視窗加「看附近的 AED／急診／藥局」，以 `lat`／`lng` 參數開啟對應工具。

### F. 我附近
- 新頁面，預設 8 類：AED、急診、藥局、診所、避難所、公廁、涼適點、無障礙 ATM，每類最近 3 筆；「更多類型」按需載入其餘設施類型。
- 資料：多數類型來自既有設施表（以 facility type 區分）；避難所來自災害據點表；急診量能來自急診狀態表。新增一支 nearby 聚合 API，內部對每類型呼叫既有最近點查詢，單一類型失敗不影響其他類型（比照 #377 unified error state）。
- 單次請求最多 8 個類型查詢；「更多類型」逐類延遲載入，避免一次 37 類查詢壓垮主機。

### G. 首頁
- 版面順序：定位感知狀態列（天氣／AQI／UV／最新地震／警報）→ 5 張生活情境卡 → 最近使用的工具（localStorage，最多 6 個）→ 焦點新聞 → 新聞列表＋精簡側欄（急診、CDC、停水、病蟲害、油價）。
- 進頁面即定位的既有決策維持不變（2026-09-14 Lighthouse 決議）。
- 新增 snapshot API 聚合原 10 個 widget 的資料：每區獨立 try/catch、獨立 freshness、伺服器端以既有 revalidate 機制快取；首頁由 10 個請求降為 1 個。

### H. 工具頁版面
- 順序：麵包屑 → 工具本體 → 下一步（相關工具）→ 相關新聞 → 所屬情境 → 計算公式 → 參考表 → 科學依據 → FAQ → 免責聲明。
- 公式、參考表、科學依據、FAQ 改為 `<details>` 收合；文字保留在 SSR HTML，JSON-LD 不變。

### I. 身體數據檔案
- 12 個健康計算器共用一個本機檔案：只存身高、體重、年齡、性別；預設關閉，勾選「記住我的資料（只存在這台裝置，不會上傳）」才寫入；一鍵清除；血壓、心率等醫療數值永不儲存。所有存取包 try/catch，localStorage 不可用時功能自動隱藏。
- 計算器間「下一步」連結同時以 URL 參數帶入當次數值（不需勾選記住）。
- 隱私權政策新增一節說明。

### J. 地圖
- 9 個地圖元件收斂為單一 BaseMap：底圖、備援、定位按鈕、群聚、attribution、清單／地圖切換、i18n。各工具只提供 markers 與 popup renderer。
- 底圖：預設國土測繪中心 EMAP WMTS（正體中文），載入錯誤時自動切換 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`（無 `{s}` 子網域）；兩者 URL 為單一設定常數；attribution 同時標示「© 內政部國土測繪中心」「© OpenStreetMap contributors」。
- `react-leaflet` 保留，待 Leaflet 2.0 穩定版後再評估。

### K. 定位
- 全站定位收斂為單一 hook：Permissions-API-aware timeout（延續 2026-09-09 修正）、結果快取於 sessionStorage 全站共用、拒絕或逾時時明確提示手動選擇縣市／鄉鎮，不得靜默套用預設座標。

### L. 套件與執行環境
- 移除：`swiper`、`sharp`（`images.unoptimized: true`，移除前先確認 build 無警告）、`framer-motion`（唯一使用處改 CSS `@starting-style`＋`prefers-reduced-motion`）、`react-hot-toast`（改寫約 40 行 Toast 元件）、`iconv-lite`（改 `TextDecoder("big5")`，以既有 Big5 樣本比對輸出完全一致）。
- `segmentit` → `Intl.Segmenter("zh-TW", { granularity: "word" })`：先以 200 篇新聞比對抽出的配圖關鍵字，差異過大則保留 segmentit 並記錄結果。
- Runtime 相依由 18 個降至 12 個。
- Node 20 → 24 LTS：正式主機以 nvm 安裝 v24，先在非正式 port 跑 next start 觀察 RSS 與 GC，穩定後切換 PM2 interpreter；CI 11 個 workflow 同步改版本；`engines` 改 `>=24`；v20 保留一週供回退。
- 清除 23 個樣板殘留空目錄；README 技術棧徽章與分類說明改為與實際一致。

### M. UTM
- 全站外連一律經 outbound UTM 函式：`utm_source=health.j172.tw`（維持既有決策，不帶協定字串）；`utm_medium` 依版位（`tool_outbound`、`civic_partner`、`news_outbound`、`map_attribution`、`guide_outbound`、`social` 等）；`utm_campaign` 為工具／hub slug；既有 UTM 參數不覆蓋。
- 涵蓋：20 個寫死外連（地圖 attribution 9、防災物資 6、Footer 社群 3、其他 2）、catalog 139 個科學依據連結、新 hub／分類頁外連。

### N. i18n
- 維持 zh-TW／en／ja／ko 四語。**非指定頁面**只翻譯介面字串與名稱（分類、工具、hub、按鈕），補齊 24 個缺漏工具名稱翻譯與所有新字串，內文維持中文。**指定頁面**改為完整多語系，見 §Q（2026-10-12 追加決策取代原本「內文一律中文」）。

### O. 分期與交付
- P0 速贏：移除 swiper／sharp／空目錄；M1、M2；Ctrl+K 搜尋工具；修正壞相關連結＋補 19 個孤兒；補翻譯；README；OSM 去 `{s}`；UTM 覆蓋率；**T6 YouBike 15 縣市**；**§T Cloudflare 設定即程式碼＋AI 爬蟲放行＋Crawler Hints（移除自寫 IndexNow）＋Web Analytics**（AI 爬蟲放行優先，越早上線越早被 AI 收錄）。
- P1 資訊架構：7 分類、導覽模型建構器、分類頁、麵包屑加入分類層、mega menu、Footer、`/tools` 索引改用單一來源。
- P2 交叉連結：keywords、新聞↔工具、5 個 hub、我附近、彈出視窗深連結；**TDX T1–T4**（T2、T3 是「我附近」與 hub 的資料來源，所以與它們同期）。前置：`fix/tdx-seniors-base-path`（共用 TDX 模組與座標轉換）須先合併。同期做 **§R Schema.org／AEO** 與 **§S 每頁 llms.txt＋.md**（新頁面類型一建立就帶齊）。
- P3 版面：首頁＋snapshot API、工具頁重排、手機底部導覽、身體數據檔案。
- P4 技術（可與 P1–P3 平行）：BaseMap＋EMAP、定位 hook、套件替換、Node 24、**§T 靜態圖片轉換**。
- P5 合併：M3、M4。
- **P6 多語系支援（§Q）**：P1–P3 完成後進行（hub、我附近、新工具頁版面先定型，避免翻譯兩次）；含外語路由、語系檔、hreflang、sitemap alternates、`?lang=` 301、外語版 llms.txt／.md。
- 每個 issue 由 worktree agent 做到開 PR 為止；orchestrator 逐一閱讀 diff 後 merge，在 :15–:30 或 :45–:00 部署，部署後實打 live API 與受影響頁面驗證，並與 Lighthouse 基準比對。

### P. TDX 交通資料整合（2026-10-12 追加）
來源：TDX 基礎服務（server `https://tdx.transportdata.tw/api/basic`）OpenAPI 文件實測。原則：**不新增 catalog 工具頁**（維持 79 個），資料一律餵給既有工具、hub 與「我附近」。
- **共通**：一律經既有 `getTdxToken()`＋`httpGetJson`；逐縣市呼叫依序執行並加間隔（TDX 有每秒請求上限）；座標一律經 `parseTdxCoordinate()`；集中一份縣市代碼對照表（basic 用英文名如 `Taipei`、`NewTaipei`，`seniors` 用 3 碼如 `TPE`）；只存最新狀態的表，UNIQUE KEY 不得含時間欄位；每個新同步都要有種子備援並錯開既有排程分鐘數（目前 in-app 已有 36 個 job）。
- **T1 無障礙公車真實資料**：每日同步 `GET /v3/Bus/Vehicle/City/{City}`，依縣市計算 `IsLowFloor=1` 比率與 `HasLiftOrRamp` 比率，取代 `accessible_transit_routes` 的寫死種子值；路線層級用 `GET /v3/Bus/Schedule/City/{City}` 的班次 `IsLowFloor` 標示。呈現在 `accessible-transit`。
- **T2 盲人有聲號誌**：同步 `GET /v1/Traffic/Road/APS/City/{City}`（座標、路名、各方向引導音、`AppActivatedSignal` 與 App 下載連結）。呈現為「我附近」的「更多類型」一類、「身心障礙者生活」hub 一步、`BaseMap` 圖層。
- **T3 特殊車位**：同步路外 `OffStreet/{CarPark, ParkingSpace, ParkingAvailability}/City/{City}` 與路邊 `OnStreet/{ParkingSegmentSpace, ParkingSegmentAvailability}/City/{City}`，**只保留** `SpaceType` 7 孕婦及親子、9 身障汽車、10 身障機車、13 復康巴士。即時剩餘數獨立一張以「停車場＋SpaceType」為唯一鍵的表、每次覆寫。呈現為「我附近」更多類型、「懷孕到育兒」與「身心障礙者生活」hub。
- **T4 全台軌道營運通阻**：`/v2/Rail/Metro/Alert/{TRTC|TRTCMG|TYMC|TMRT|KRTC|KLRT}`、`/v3/Rail/TRA/Alert`、`/v2/Rail/THSR/AlertInfo` 正規化為同一張通阻表；`/tools/metro-alerts` 保留 slug、標題改為「全台軌道營運通阻」，臺北捷運原 data.taipei CSV 來源退役（或作為備援，實作時依資料完整度決定）。納入「颱風地震來了」hub 一步。
- **T6 YouBike 15 縣市**：`lib/server/youbike/tdxClient.ts` 的 `TDX_CITIES` 由 5 個擴充為 TDX `/v2/Bike/*/City/{City}` 列舉的全部 15 個。
- 不納入（2.0 之後另開）：T5 醫院接駁公車、T7 道路災害事件、T8 偏鄉 DRTS、T9 充電站、T10 國定假日、T11 行政區界線。

### Q. 多語系支援（2026-10-12 追加）
- **範圍（約 21 頁，清單集中定義於 catalog，供路由、sitemap、llms.txt、測試共用）**：緊急電話、急診看板、AED、醫療院所、藥局、公廁、YouBike、全台軌道通阻（metro-alerts）、無障礙交通、氣象警報、地震、AQI、UV、防災避難地圖、涼適點、藝文活動、文化資產、觀光工廠、「我附近」、`/guides/typhoon-earthquake`、首頁。其餘頁面不提供外語網址。
- **網址**：路徑前綴 `/en/`、`/ja/`、`/ko/`；中文維持現有網址、不加前綴。伺服器端直接輸出該語言 HTML（`<html lang>`、`<title>`、meta、JSON-LD、內文皆為該語言），可被 ISR 與 Cloudflare 快取；同一套頁面元件服務四種語言，不得複製頁面檔案。
- **翻譯深度**：介面＋頁面內容全翻（標題、description、directAnswer、FAQ、使用步驟、提示與錯誤訊息、hub 步驟說明）。**政府資料保留中文原文**（機構名稱、地址、公告內文），旁加英文類別標籤（例如 `AED`、`Hospital`）、「複製地址」與 Google 地圖導航按鈕。不在請求當下即時翻譯。
- **翻譯產製**：以 AI 產生初稿、人工抽查醫療相關詞彙後存成靜態語系檔（版本控管）；新增或修改指定頁面的中文內容時，CI 檢查三語是否同步齊全。
- **SEO 標記**：每個語言版本 canonical 指向自己；`hreflang` 互相指涉 `zh-Hant-TW`、`en`、`ja`、`ko`，`x-default` 指向中文版；sitemap 每個網址附 alternates；`og:locale` 與 `og:locale:alternate`。
- **語言切換**：指定頁面切換時導向對應語言網址；其餘頁面切換只改介面字串，並提示「此頁僅提供中文」。**不依瀏覽器語言自動跳轉**（避免爬蟲與使用者被強制導向），改顯示可關閉的語言建議橫幅。
- **舊網址**：`?lang=en|ja|ko` 若該頁有外語版則 301 到 `/{locale}/…`，否則 301 到去掉參數的中文頁；移除目前指向 `?lang=` 的錯誤 hreflang。

### R. SEO／AEO／GEO／Schema.org（2026-10-12 追加）
- **JSON-LD 依頁面類型**（全部由純函式 builder 產生）：
  | 頁面 | 型別 |
  |---|---|
  | 全站 | `Organization`（含 `publishingPrinciples`、`ethicsPolicy`）、`WebSite`＋`SearchAction` |
  | 工具頁 | 既有 `MedicalWebPage`／`WebPage`＋`WebApplication`＋`FAQPage`，加 `BreadcrumbList`（含分類層）、`speakable`、`citation`（來自 scientificBasis）、`dateModified` |
  | 分類頁 | `CollectionPage`＋`ItemList` |
  | 生活情境 hub | `HowTo`（步驟）＋`ItemList`＋`FAQPage` |
  | 我附近／機構清單 | `ItemList`，項目依類型用 `Hospital`／`MedicalClinic`／`Pharmacy`／`Place` 等，含 `geo`、`address`、`telephone` |
  | 藝文活動 | `Event` |
  | 新聞 | 既有 `NewsArticle` |
  | 外語版 | 同上並加 `inLanguage`，以 `workTranslation`／`translationOfWork` 連回中文版 |
- **AEO**：每個工具、hub、分類頁開頭都有 40–80 字一句話答案（`directAnswer`），標記為 `speakable`；FAQ 以問句形式呈現並輸出 `FAQPage`。
- **GEO**：AI 爬蟲全面放行（§T）、每頁 `llms.txt`＋`.md`（§S）、權威依據以 `citation` 結構化、頁面顯示最後更新時間。
- `/llms.txt`、`/llms-full.txt`、sitemap 一併納入外語版與新頁面類型。

### S. 每頁 llms.txt 與 Markdown（2026-10-12 追加）
- 依 llmstxt.org：llms.txt 可放在任何路徑並描述該路徑以下的頁面；每頁應提供同網址的 Markdown 版本。
- **每個公開頁面**提供兩個機器可讀檔：
  - `/{path}/llms.txt`：H1 頁名、blockquote 一句話答案、`## 資料來源`、`## 相關頁面`、`## 常見問題`，連結皆為完整網址。
  - `/{path}.md`：整頁乾淨 Markdown 全文（不含導覽、頁尾、腳本）。
  - 首頁對應 `/llms.txt`（既有）與 `/index.md`。
- **涵蓋**：工具頁、分類頁、hub、我附近、新聞內頁（僅官方新聞，非官方新聞本來就直接導向原站）、隱私、無障礙、`/llm-info`；外語頁面同樣各有一份（`/en/tools/aed/llms.txt`、`/en/tools/aed.md`）。
- **宣告**：HTML `<head>` 加 `<link rel="describedby" href=".../llms.txt">` 與 `<link rel="alternate" type="text/markdown" href="....md">`；Cloudflare 標頭轉換規則另加 HTTP `Link` 標頭。
- **產生方式**：與 HTML 共用同一份資料（catalog、語系檔、資料庫），由純函式 builder 產生；`Content-Type: text/plain`／`text/markdown; charset=utf-8`；ISR＋Cloudflare 長時間邊緣快取，部署時清除。不使用 Cloudflare「Markdown for Agents」（僅付費方案）。

### T. Cloudflare 免費方案整合（2026-10-12 追加）
- **設定即程式碼**：zone 設定、Cache Rules、標頭轉換規則（安全標頭、`Link` 標頭、移除 `X-Powered-By`）、WAF 自訂規則（保護 `/admin`、`/api/admin`）、1 條限流規則、AI 爬蟲政策、Early Hints、Speed Brain、HTTP/3、Smart Tiered Cache 全部寫成 repo 內的設定檔；GitHub Actions workflow 先輸出與現況的差異（plan），人工核准後才套用（apply）。API token 需補 Zone Settings、Rulesets、Bot Management 編輯權限，並注意 `FTP_SERVER` Environment secret 會覆蓋同名 Repository secret。
- **AI 爬蟲**：Search、Agent、Training 三類全部允許；保留 Bot Fight Mode 擋惡意爬蟲；`robots.txt` 維持明確允許並加上 Content Signals（search、ai-input、ai-train 皆為 yes），與站上 CC0 結構化資料宣告一致。
  - **⚠️ 負載風險**：2026-08-16 開啟 AI 機器人防護（`ai_bots_protection: block`），正是因為 AI 爬蟲流量加劇了主機 NPROC 耗盡事故。放行前必須先上線緩解措施，**且與放行在同一次變更中套用**：(1) HTML、`llms.txt`、`.md` 的邊緣快取規則先生效，讓爬蟲大多命中 Cloudflare 快取而不打到主機；(2) 用唯一一條限流規則限制非瀏覽器請求打到主機的頻率；(3) **保留**既有封鎖 SemrushBot、AhrefsBot 的 WAF 規則（rule id `375d8e07c0c442caba42a540eb3b9069`），設定即程式碼匯入時不得遺失。放行後 72 小時內每日比對主機 NPROC 與 Cloudflare 快取命中率，若重現 NPROC 告警，先把 Training 改為封鎖、Search 與 Agent 維持放行。
- **Crawler Hints**：開啟，並移除站上自寫的 IndexNow 提交程式與相關排程（保留金鑰檔直到確認 Cloudflare 端生效）。
- **Web Analytics**：加入 Cloudflare 無 cookie 分析；GA 與 Clarity 保留。
- **圖片轉換**：只套用在數量固定的靜態圖（logo、工具圖示、hub 封面，約數百張），經 `/cdn-cgi/image/` 輸出 AVIF／WebP 與指定寬度；免費方案每月 5,000 次不重複轉換、超過後新圖回錯誤，所以**新聞圖不使用**，並以測試限制只有允許的圖片路徑可產生轉換網址。
- **快取**：外語前綴頁、`llms.txt`、`.md` 皆納入 HTML 快取規則；部署後清除相關路徑快取。

## Testing Decisions

- **好測試的標準**：只驗證外部可觀察行為（純函式的輸入→輸出、頁面引用到的資料契約、原始碼中不得出現的寫法），不驗證內部實作細節；不需要資料庫或瀏覽器即可執行，沿用 `node --test`＋`registerHooks` 解析 `@/` 與 `.ts` 的既有模式。
- **接縫 ①（主接縫）導覽模型**：對 catalog 推導出的 Nav、Footer、分類頁、hub、搜尋、redirect 模型測試——
  - 恰好 7 個分類；每個工具恰好屬於一個分類、恰好出現在 Nav 一次與一個分類頁一次。
  - Footer 恰好 4 欄、連結數符合預期，不含個別工具連結。
  - 相關連結圖：無懸空 slug、無指向分類名或 noindex 頁、每個工具入站 ≥ 2、每個工具顯示的相關工具 ≥ 4。
  - 每個 hub 的每一步都指向存在的工具。
  - 每個被合併的舊 slug 都有 301 規則且目標存在、帶正確分頁參數；不存在轉址鏈。
  - 搜尋：以俗稱關鍵字（例如「心臟電擊」）可找到對應工具；工具結果排在新聞前。
  - en／ja／ko 每個工具、分類、hub 名稱都有翻譯。
  - 排序符合筆畫規則。
  - 先例：既有 footer links／catalog 測試、`pagination-and-search` 測試。
- **接縫 ② 原始碼掃描**：
  - 外部 `https://` 連結（排除本站網域）必須經 UTM 函式。先例：`outboundLinkUtm` 測試。
  - 底圖網址只允許出現在 BaseMap 設定常數；禁止 `{s}.tile.openstreetmap.org`。
  - `navigator.geolocation` 只允許出現在定位 hook。
  - 已移除套件（swiper、sharp、framer-motion、react-hot-toast、iconv-lite，及通過 A/B 後的 segmentit）不得再被 import。
  - 先例：`no-server-fetch` 測試。
- **接縫 ③ 聚合函式**：snapshot 與 nearby 的組裝函式以注入假資料來源測試——單一來源拋錯或逾時時，其餘區塊仍正確回傳、錯誤區塊標記為錯誤狀態；nearby 依距離排序、每類截取 3 筆、類型上限 8。先例：`useSidebarWidgetData`、`useNearestStation` 測試。
- **TDX 資料（接縫 ②＋純函式）**：原始碼掃描確保所有 TDX 座標寫入都經 `parseTdxCoordinate()`（先例：`lib/server/tdx/seniors.test.mjs`）；以假 TDX 回應測試純函式——低地板比率計算（含 0 台車的縣市）、車位只保留 7／9／10／13 四種 `SpaceType`、三種軌道通阻格式正規化為同一結構、縣市代碼對照涵蓋 basic 與 seniors 兩套。
- **多語系（接縫 ①）**：指定頁面清單中每頁都有 en／ja／ko 完整內容（標題、description、directAnswer、FAQ、步驟），不得有空字串或退回中文；hreflang 集合互相指涉且含 `x-default`；每個 `?lang=` 舊網址對應到正確的 301 目標；其餘頁面不得出現外語網址。
- **llms.txt／.md 與 JSON-LD（純函式）**：每個工具、分類頁、hub 的 llms.txt 符合 llmstxt.org 文法（H1、blockquote、H2 下單行連結）且連結皆為完整網址；`.md` 不含 HTML 標籤；各頁面類型 JSON-LD 具備該型別必要屬性；外語版 JSON-LD 帶 `inLanguage` 與翻譯關聯。
- **Cloudflare 設定**：設定檔以 schema 驗證；CI 只跑 plan、不跑 apply；原始碼掃描確保圖片轉換網址只出現在允許的靜態圖路徑、站上不再有自寫 IndexNow 呼叫。
- **其他單元測試**：照顧圈半徑內計數；身體數據檔案（未勾選不寫入、清除後為空、醫療數值永不寫入、localStorage 拋錯時不崩潰）；Big5 解碼前後輸出一致。
- **部署後 live 驗證**（非單元測試，每期必做）：實打受影響 API 與頁面、檢查舊網址 301、首頁 snapshot 各區塊有資料；以 GPTBot、ClaudeBot、PerplexityBot、Googlebot 的 User-Agent 請求頁面、`llms.txt`、`.md` 皆回 200；`/en/tools/aed` 回 `<html lang="en">` 與英文標題；以 Google Rich Results Test 抽查各頁面類型。
- 不引入瀏覽器 E2E 框架（與減少相依的方向相反）。

## Out of Scope

- Next.js Cache Components（`'use cache'`）與 React Compiler：2.0 完成且 Node 24 穩定後再評估。
- 唯讀 MCP 端點：另開獨立計畫。
- 移除 `react-leaflet`、遷移 Leaflet 2.0：等 Leaflet 2.0 穩定版。
- 路徑規劃／真實車程計算。
- **其餘頁面**的內文外語翻譯；政府資料列（機構名稱、地址、公告）的翻譯；依瀏覽器語言自動跳轉；ja／ko 語系存廢。
- Cloudflare 付費功能（Markdown for Agents、Argo、進階 Bot Management、Image 儲存與超量轉換）；新聞圖片的 Cloudflare 轉換。
- 新增 catalog 工具頁（除合併外）；新增 §P（T1–T4、T6）以外的資料源。TDX 的 T5 醫院接駁公車、T7 道路災害事件、T8 偏鄉 DRTS、T9 充電站、T10 國定假日、T11 行政區界線留待 2.0 之後。
- 人工維護的「熱門工具」清單。
- 毛孩認養＋動物醫院、AQI＋AQX 合併（#256 已決議不合併）。
- 食品業者登錄併入食安看板（本次 grill 取消）。
- 12 個健康計算器合併為單頁（保留各自 URL 以維持搜尋入口）。

## Further Notes

- 外部研究依據：Node 20 已於 2026-04-30 EOL、24 LTS 維護至 2028-04；OSMF 圖磚政策（容量有限、勿寫死網址、可無預警封鎖）；Leaflet 2.0 仍為 alpha；長照 3.0 預計 2027 上路，核心為「10 分鐘照顧圈」、據點由 720 擴至 1.5 萬；GOV.UK step-by-step navigation 作為 hub 設計參考；Cloudflare Workers 免費方案僅 5 個 cron trigger（不足以承接排程，維持現狀）。
- 主機硬限制：768MB V8 heap、20 Entry Processes、不可在請求時跑 WASM 渲染。所有新 API 必須在單次請求內有查詢數上限。
- 前置教訓：#376 在綠燈測試下造成正式環境回歸；合併 worktree agent 的 PR 前必須閱讀實際 diff（#424 先例）。
- Cloudflare 依據：2026-07 起免費方案也可依 Search／Agent／Training 三類管理 AI 爬蟲（https://developers.cloudflare.com/changelog/post/2026-07-01-ai-traffic-options/）；Markdown for Agents 僅付費方案；圖片轉換免費方案每月 5,000 次不重複轉換（https://developers.cloudflare.com/images/pricing）；Workers 免費 100,000 請求／日、5 個 cron trigger。
- llms.txt 依據：https://llmstxt.org/ — 檔案可放在任何路徑並描述其下頁面，每頁提供同網址 `.md` 版本，以 `rel="describedby"`／`rel="alternate" type="text/markdown"` 宣告。
- TDX 研究全文（18 個群組、674 支 API 逐一比對）：repo 內 `docs/2.0/tdx-basic-integration-research.md`。高齡友善 API 的正確 base 為 `https://tdx.transportdata.tw/api/seniors/V1/Senior`，修正於分支 `fix/tdx-seniors-base-path`。
- 本 spec 之後以 `/to-tickets` 依 §O 分期拆成可獨立交付的 issue。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
