export interface ToolFaq {
  question: string;
  answer: string;
}

export type ToolGroup = "calculator" | "facility" | "food" | "ltc" | "disability" | "green-shop" | "child-welfare";

export interface ToolCatalogEntry {
  slug: string;
  title: string;
  description: string;
  faqs: ToolFaq[];
  /** "calculator" → 健康工具 nav dropdown; "facility" → 醫療院所 nav dropdown; "food" → 食品營養 nav dropdown; "ltc" → 長照機構 nav dropdown; "disability" → 身心障礙 nav dropdown; "green-shop" → 綠色商店 direct nav link; "child-welfare" → 兒少福利 nav dropdown. */
  group: ToolGroup;
}

// Single source of truth for "what tools does this site have" — used by
// llms.txt (app/llms.txt/route.ts), sitemap.ts, and ToolPageShell (which
// derives each page's WebApplication/FAQPage structured data from `faqs`
// automatically by slug), so all four stay in sync without duplicating
// title/description/FAQ text across files.
export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    slug: "uv",
    group: "calculator",
    title: "全台即時紫外線指數 (UV)",
    description: "即時查詢全台各縣市氣象站紫外線指數 (UV Index)，提供紫外線曝曬防護分級（低量、中量、高量、過量、極高量）與專業防曬係數與配件建議。",
    faqs: [
      { question: "紫外線指數分級標準為何？", answer: "依中央氣象署與環境部標準：0-2 為低量級（綠色）、3-5 為中量級（黃色）、6-7 為高量級（橘色）、8-10 為過量級（紅色）、11 以上為極高量級（紫色）。" },
      { question: "過量級與極高量級應該如何防範？", answer: "當紫外線達到過量級（8-10）或極高量級（11+）時，曬傷時間約僅需 15-20 分鐘，建議儘量避免在上午 10 時至下午 2 時過度曝曬，戶外活動務必塗抹 SPF30+ 防曬乳、配戴帽子與太陽眼鏡。" },
      { question: "資料來源與更新頻率？", answer: "本站紫外線資料同步自交通部中央氣象署全台各地面氣象觀測站即時監測數據。" },
    ],
  },
  {
    slug: "earthquakes",
    group: "calculator",
    title: "全球顯著地震查詢",
    description: "即時查詢台灣與全球 M6.0+ 顯著地震動態資訊，包含震央地點、規模大小、震源深度與海嘯警報提示，整合 USGS、EMSC、HKO 與 CWA 多國測報數據。",
    faqs: [
      { question: "地震資料多久更新一次？", answer: "本站地震資料每 10 分鐘自動同步一次美國地質調查局 (USGS)、歐洲地中海地震中心 (EMSC) 與中央氣象署 (CWA) 的最新測報。" },
      { question: "什麼是 M6.0+ 顯著地震？", answer: "M6.0（芮氏規模 6.0）以上的地震屬於中強震至強震，能量巨大且影響範圍廣，本站優先顯示顯著地震以提供即時防災防護參考。" },
      { question: "海嘯警報標籤代表什麼？", answer: "當測報單位發布海嘯警報或海嘯觀察提示時，系統會自動在卡片上標示紅色的海嘯警戒警示，提示沿海地區居民注意防範。" },
    ],
  },
  {
    slug: "bmi",
    group: "calculator",
    title: "BMI 計算器",
    description: "免費線上 BMI 身體質量指數計算器，輸入身高與體重即可立即計算您的 BMI 值，並對照台灣衛生福利部國民健康署標準，了解過輕、正常、過重或肥胖的健康風險。",
    faqs: [
      { question: "BMI 是怎麼計算的？", answer: "BMI（身體質量指數）＝體重（公斤）÷ 身高（公尺）的平方。例如身高170公分、體重65公斤，BMI ＝ 65 ÷ (1.7 × 1.7) ≈ 22.5。" },
      { question: "台灣的 BMI 標準範圍是多少？", answer: "依衛福部國健署標準：BMI < 18.5 為過輕，18.5–24 為正常範圍，24–27 為過重，27 以上為肥胖，與 WHO 的國際標準（正常上限 25）略有不同。" },
      { question: "BMI 正常就代表健康嗎？", answer: "BMI 只反映體重與身高的比例，無法區分肌肉與脂肪比例，運動員或肌肉量高的人可能BMI偏高但體脂率正常。建議搭配體脂率、腰臀比等指標一起評估。" },
    ],
  },
  {
    slug: "calories",
    group: "calculator",
    title: "卡路里需求計算器",
    description: "根據年齡、性別、身高、體重與活動量，採用 Mifflin-St Jeor 公式計算每日所需熱量攝取 (BMR/TDEE)。",
    faqs: [
      { question: "BMR 和 TDEE 有什麼差別？", answer: "BMR（基礎代謝率）是身體在完全靜止狀態下維持生命所需的最低熱量；TDEE（每日總消耗熱量）則是 BMR 再乘上活動量係數，反映實際生活中消耗的總熱量。" },
      { question: "為什麼用 Mifflin-St Jeor 公式？", answer: "Mifflin-St Jeor 公式是目前研究上公認準確度較高的 BMR 估算公式之一，比舊式的 Harris-Benedict 公式更貼近現代人的身體組成。" },
      { question: "想減重應該攝取多少熱量？", answer: "一般建議在 TDEE 基礎上減少 300–500 大卡，可達到每週約 0.25–0.5 公斤的溫和減重速度，避免熱量赤字過大影響代謝與肌肉量。" },
    ],
  },
  {
    slug: "nutrition",
    group: "calculator",
    title: "每日營養素建議計算器",
    description: "依據個人體型、活動量與飲食目標，提供每日三大營養素（蛋白質、碳水化合物、脂肪）攝取建議。",
    faqs: [
      { question: "三大營養素的建議比例是多少？", answer: "依飲食目標而異，一般均衡飲食常見比例約為碳水化合物 45–65%、蛋白質 10–35%、脂肪 20–35%（以熱量佔比計算），本工具會依您的目標（增肌、減脂、維持）調整比例。" },
      { question: "增肌需要吃多少蛋白質？", answer: "增肌階段建議每公斤體重攝取約 1.6–2.2 公克蛋白質，一般日常維持則約 0.8–1.2 公克/公斤即可。" },
    ],
  },
  {
    slug: "water",
    group: "calculator",
    title: "飲水量計算器",
    description: "依體重與活動量計算每日建議飲水量，並提供分段補水時間表，幫助您養成良好的補水習慣。",
    faqs: [
      { question: "每天應該喝多少水？", answer: "常見估算方式為體重（公斤）乘以 30–35 毫升，再依運動量、氣溫等因素調整；例如 60 公斤的人約需 1800–2100 毫升。" },
      { question: "喝咖啡或茶算在飲水量裡嗎？", answer: "含咖啡因飲品有輕微利尿作用，建議仍以白開水為主要補水來源，咖啡、茶等飲品可作為額外攝取，不宜完全取代飲水。" },
    ],
  },
  {
    slug: "body-fat",
    group: "calculator",
    title: "體脂率計算器",
    description: "採用美國海軍體脂計算法（Navy Method），計算體脂率、脂肪質量與肌肉量，對照 ACSM 標準分類。",
    faqs: [
      { question: "Navy Method 怎麼測量體脂率？", answer: "美國海軍體脂公式利用頸圍、腰圍（女性另加臀圍）與身高，透過對數迴歸公式估算體脂率，不需要體脂計等器材，是一種便於居家自我評估的方式。" },
      { question: "體脂率多少算正常？", answer: "依 ACSM 標準，成年男性健康體脂率約 10–20%，成年女性約 18–28%，實際標準會依年齡略有調整。" },
    ],
  },
  {
    slug: "waist-hip",
    group: "calculator",
    title: "腰臀比計算器",
    description: "計算腰臀比（WHR），依 WHO 標準評估腹部肥胖與心血管代謝風險。",
    faqs: [
      { question: "腰臀比（WHR）如何計算？", answer: "WHR ＝ 腰圍 ÷ 臀圍（單位需一致，如皆為公分）。例如腰圍80公分、臀圍100公分，WHR ＝ 0.8。" },
      { question: "腰臀比多少代表風險較高？", answer: "依 WHO 標準，男性 WHR 超過 0.90、女性超過 0.85，即屬於腹部肥胖，心血管與代謝疾病風險相對較高。" },
    ],
  },
  {
    slug: "heart-rate",
    group: "calculator",
    title: "目標心率計算器",
    description: "使用 Karvonen 公式計算 5 個運動強度心率區間，幫助您精準控制訓練強度，支援手動輸入 Apple Watch、iPhone 健康 App 記錄的靜止心率。",
    faqs: [
      { question: "Karvonen 公式和一般的「220減年齡」有什麼不同？", answer: "Karvonen 公式額外納入安靜心率（儲備心率），比單純「220−年齡」的最大心率估算法更能反映個人心肺基礎狀態，計算出的目標心率區間也更準確。" },
      { question: "5 個心率區間分別對應什麼訓練效果？", answer: "由低到高依序約對應：恢復／熱身、燃脂、有氧耐力、無氧閾值、最大攝氧量訓練，可依訓練目的選擇對應區間維持運動強度。" },
      { question: "可以用 Apple Watch 或 iPhone 健康 App 的心率資料嗎？", answer: "可以。網頁無法直接讀取 Apple Watch 或 iPhone 健康 App 的 HealthKit 資料，但您可以在 Apple Watch 或健康 App 上查看目前的靜止心率，手動輸入到本工具即可計算目標心率區間，不需自行把脈量測。" },
    ],
  },
  {
    slug: "blood-pressure",
    group: "calculator",
    title: "血壓分析器",
    description: "依 2023 ESH 高血壓指南分類血壓等級，支援多次記錄與平均值分析，提供個人化生活建議。",
    faqs: [
      { question: "血壓多少算高血壓？", answer: "依 2023 ESH（歐洲高血壓學會）指南，收縮壓 ≥140 mmHg 或舒張壓 ≥90 mmHg 即達高血壓標準；120–139/70–89 mmHg 屬於「正常偏高」，需留意生活型態調整。" },
      { question: "為什麼要記錄多次血壓再平均？", answer: "單次血壓測量易受當下情緒、活動、白袍效應等因素影響，多次測量取平均值能更準確反映真實血壓狀況，這也是臨床診斷高血壓的建議做法。" },
    ],
  },
  {
    slug: "sleep",
    group: "calculator",
    title: "睡眠品質評估",
    description: "基於 PSQI 量表 7 個面向，評估您的睡眠狀況並提供科學化睡眠衛生改善建議，可搭配 Apple Watch、iPhone 睡眠追蹤紀錄回答更準確。",
    faqs: [
      { question: "PSQI 量表評估哪些面向？", answer: "匹茲堡睡眠品質指數（PSQI）涵蓋主觀睡眠品質、入睡時間、睡眠時數、睡眠效率、睡眠困擾、使用助眠藥物、日間功能障礙共 7 個面向。" },
      { question: "PSQI 分數多少代表睡眠品質不佳？", answer: "PSQI 總分範圍為 0–21 分，一般以總分超過 5 分視為睡眠品質不佳的臨床切點。" },
      { question: "可以用 Apple Watch 或 iPhone 睡眠追蹤的資料回答問卷嗎？", answer: "可以。若有使用 Apple Watch 或 iPhone「健康」App 的睡眠追蹤功能，可先查看其記錄的平均睡眠時數與入睡所需時間，作為回答對應題目的參考依據，讓評估結果更準確。" },
    ],
  },
  {
    slug: "stress",
    group: "calculator",
    title: "壓力評估測驗",
    description: "採用 PSS-10 知覺壓力量表，10 道題目量化壓力程度，提供個人化減壓策略。",
    faqs: [
      { question: "PSS-10 是什麼？", answer: "PSS-10（Perceived Stress Scale）是國際廣泛使用的知覺壓力量表，透過 10 道題目評估最近一個月內個人感受到的壓力程度，分數越高代表主觀壓力感越大。" },
    ],
  },
  {
    slug: "lbm",
    group: "calculator",
    title: "去脂體重 (LBM) 計算器",
    description: "以 Boer 公式估算去脂體重與體脂率，全面了解您的身體組成狀況。",
    faqs: [
      { question: "去脂體重（LBM）是什麼？", answer: "去脂體重指扣除脂肪後的體重，包含肌肉、骨骼、器官與水分等，是評估身體組成、肌肉量變化的重要指標。" },
      { question: "Boer 公式怎麼計算 LBM？", answer: "Boer 公式依性別、身高、體重推算去脂體重，男性與女性各有不同係數，是常用且相對簡便的人體組成估算方式之一。" },
    ],
  },
  {
    slug: "vo2max",
    group: "calculator",
    title: "VO2Max 估算器",
    description: "輸入年齡與安靜心率，以 Uth 公式快速評估最大攝氧量（VO2Max），對照 ACSM 標準了解您的心肺耐力等級，安靜心率可直接參考 Apple Watch 或 iPhone 健康 App 的紀錄。",
    faqs: [
      { question: "VO2Max 代表什麼？", answer: "VO2Max（最大攝氧量）是身體在最大運動強度下每分鐘每公斤體重能利用的最大氧氣量，是評估心肺耐力與有氧運動能力的重要指標。" },
      { question: "不用實際運動測試也能估算 VO2Max 嗎？", answer: "Uth 公式只需安靜心率與最大心率（依年齡估算）即可快速推估 VO2Max，準確度不如實驗室測試，但適合作為日常心肺耐力的初步參考。" },
      { question: "Apple Watch 本身就會估算 VO2Max，跟這個工具的結果一樣嗎？", answer: "不一定相同。Apple Watch 是用戶外健走或跑步時的心率與速度資料估算 VO2Max，本工具則是用安靜心率套用 Uth 公式粗估，兩者演算法不同，數字可能有落差；安靜心率本身則可直接參考 Apple Watch 或 iPhone 健康 App 的紀錄，手動輸入即可。" },
    ],
  },
  {
    slug: "aqi",
    group: "calculator",
    title: "AQI 空氣品質即時查詢",
    description: "即時顯示全台環境部監測站 AQI 空氣品質指標，包含 PM2.5、PM10 等污染物濃度。",
    faqs: [
      { question: "AQI 數值如何解讀？", answer: "AQI（空氣品質指標）數值 0–50 為良好、51–100 普通、101–150 對敏感族群不健康、151–200 對所有族群不健康，數值越高代表空氣污染越嚴重。" },
      { question: "資料來源是哪裡？", answer: "資料來自環境部（環保署）全台各監測站的即時空氣品質觀測資料。" },
    ],
  },
  {
    slug: "clinics",
    group: "facility",
    title: "醫療院所查詢",
    description: "查詢全民健保特約醫療院所，支援關鍵字搜尋與附近定位。",
    faqs: [
      { question: "可以查詢哪些層級的醫療院所？", answer: "目前收錄全民健保特約的醫學中心、區域醫院、地區醫院及基層診所。" },
      { question: "資料多久更新一次？", answer: "資料來源為衛福部中央健康保險署公開資料，會定期同步更新。" },
    ],
  },
  {
    slug: "pharmacies",
    group: "facility",
    title: "藥局查詢",
    description: "查詢全台一般藥局及健保特約藥局，支援關鍵字搜尋與附近定位。",
    faqs: [
      { question: "一般藥局跟健保特約藥局有什麼不同？", answer: "健保特約藥局可受理健保處方箋、提供健保給付的調劑服務；一般藥局則不一定有特約資格，僅能提供成藥銷售等服務。本工具兩者皆有收錄並標示。" },
    ],
  },
  {
    slug: "drugs",
    group: "facility",
    title: "藥品查詢",
    description: "查詢衛福部食藥署核准藥品的許可證字號、中英文品名與外觀特徵，協助辨識藥品。",
    faqs: [
      { question: "可以查詢哪些藥品資訊？", answer: "可查詢藥品的許可證字號、中英文品名、劑型、外觀顏色、形狀等資訊，資料來源為衛福部食藥署核准藥品資料庫。" },
      { question: "這個工具能取代藥師諮詢嗎？", answer: "不能。本工具僅提供公開資料查詢，實際用藥安全、交互作用等問題仍請諮詢醫師或藥師。" },
    ],
  },
  {
    slug: "food-nutrition",
    group: "food",
    title: "食品營養成分查詢",
    description: "查詢衛福部食藥署食品營養成分資料庫，依食品名稱搜尋熱量、蛋白質、脂肪、碳水化合物等營養成分含量。",
    faqs: [
      { question: "營養成分數值是以什麼為單位？", answer: "資料庫以每100克食品的含量為主，部分品項另提供每單位（如每份、每顆）的含量與對應重量，實際以查詢結果顯示為準。" },
      { question: "資料來源是什麼？", answer: "資料來源為衛福部食藥署「食品營養成分資料庫」，收錄台灣常見食品的實測分析數據，每半年更新一次。" },
    ],
  },
  {
    slug: "food-operators",
    group: "food",
    title: "食品業者登錄查詢",
    description: "查詢衛福部食藥署食品業者登錄資料，依公司名稱、統一編號或地址搜尋登錄項目（販售場所、製造場所、餐飲場所等）。",
    faqs: [
      { question: "食品業者登錄字號代表什麼？", answer: "登錄字號是食品業者依食品安全衛生管理法完成「食品業者登錄平台」登錄後取得的唯一識別碼，用於追溯業者登錄狀態。" },
      { question: "查不到某業者代表什麼？", answer: "可能是該業者尚未完成登錄，或登錄名稱與搜尋關鍵字不完全相符，建議嘗試以統一編號或地址關鍵字查詢。" },
    ],
  },
  {
    slug: "health-checks",
    group: "facility",
    title: "健康檢查機構查詢",
    description: "查詢勞工健康檢查認可醫療機構及職業傷病防治網絡醫院，支援關鍵字搜尋與附近定位。",
    faqs: [
      { question: "收錄哪些類型的健檢機構？", answer: "收錄勞動部認可的勞工體格及健康檢查醫療機構，以及職業傷病防治網絡醫院兩類資料。" },
    ],
  },
  {
    slug: "long-term-care",
    group: "ltc",
    title: "長照機構查詢",
    description: "查詢衛福部許可全台長期照顧服務機構，支援關鍵字搜尋與附近定位。",
    faqs: [
      { question: "資料涵蓋哪些長照機構？", answer: "資料來源為衛福部許可的全台長期照顧服務機構名冊，涵蓋各縣市的長照服務單位。" },
    ],
  },
  {
    slug: "home-healthcare",
    group: "facility",
    title: "居家醫療查詢",
    description: "查詢提供居家醫療照護服務的全民健保特約機構，支援關鍵字搜尋與附近定位。",
    faqs: [
      { question: "居家醫療服務包含哪些內容？", answer: "居家醫療是由健保特約醫事機構到宅提供的醫療照護服務，適用於行動不便、有醫療照護需求但難以親自就醫的民眾，實際服務項目依機構而定。" },
    ],
  },
  {
    slug: "disability-welfare",
    group: "disability",
    title: "身心障礙福利機構查詢",
    description: "查詢衛福部全國身心障礙福利機構名冊，支援關鍵字搜尋與附近定位。",
    faqs: [
      { question: "資料涵蓋哪些身心障礙福利機構？", answer: "資料來源為衛福部社會及家庭署開放資料「全國身心障礙福利機構一覽表」，涵蓋全台各類身心障礙福利服務機構。" },
    ],
  },
  {
    slug: "disability-atm",
    group: "disability",
    title: "信用合作社無障礙ATM查詢",
    description: "查詢全台信用合作社提供輪椅可及或語音服務的無障礙ATM，支援關鍵字搜尋與附近定位。",
    faqs: [
      { question: "資料涵蓋哪些無障礙ATM？", answer: "資料來源為中華民國信用合作社聯合社的輪椅可及ATM與語音服務ATM名冊，兩份名單依信用合作社分社代號合併，同一分社若同時提供兩種服務會標示為「輪椅可及、語音服務」。" },
    ],
  },
  {
    slug: "elder-welfare",
    group: "ltc",
    title: "老人福利機構查詢",
    description: "查詢衛福部全國老人福利機構名冊，支援關鍵字搜尋與附近定位。",
    faqs: [
      { question: "資料涵蓋哪些老人福利機構？", answer: "資料來源為衛福部社會及家庭署開放資料「全國老人福利機構名冊」，涵蓋安養、養護、長期照顧等各類老人福利機構，資料按縣市分別提供。" },
    ],
  },
  {
    slug: "ltc-contracted",
    group: "ltc",
    title: "長照特約服務機構查詢",
    description: "查詢衛福部長照2.0特約服務機構，涵蓋居家服務、日間照顧、喘息服務等，支援關鍵字搜尋與附近定位。",
    faqs: [
      { question: "跟「長照機構查詢」有什麼不同？", answer: "「長照機構查詢」是長照服務單位的機構名冊；本頁收錄的是與衛福部簽有長照2.0特約的服務機構，資料更完整、涵蓋機構數更多，並標示每家機構實際承作的特約服務項目（如居家服務、日間照顧、喘息服務等）。" },
    ],
  },
  {
    slug: "hakka-community",
    group: "ltc",
    title: "客庄社區發展協會查詢",
    description: "查詢客家委員會客庄社區發展協會名冊，支援關鍵字搜尋與附近定位。",
    faqs: [
      { question: "客庄社區發展協會提供哪些服務？", answer: "客庄社區發展協會多承辦社區照顧關懷據點等在地服務，實際服務項目（如共餐、關懷訪視）依各協會而定，建議直接與協會聯繫確認。" },
    ],
  },
  {
    // Catalog stub only — no data/route wired up yet. Title/description
    // match the copy already finalized in docs/specs/phase3-green-shops.md
    // §3 so nav/footer don't show placeholder-looking text in the
    // meantime; Phase 3 owns the actual facilitySearchConfigs entry + page.
    slug: "green-shops",
    group: "green-shop",
    title: "綠色商店查詢",
    description: "查詢環境部認證綠色商店。資料來源：環境部。",
    faqs: [
      { question: "什麼是環境部認證綠色商店？", answer: "綠色商店是通過環境部認證、優先採購及販售環保標章商品的商店，資料來源為環境部認證名冊。" },
    ],
  },
  {
    slug: "child-welfare-nurseries",
    group: "child-welfare",
    title: "全國親子館查詢",
    description: "查詢全國親子館（托育資源中心）名冊，提供育兒資源與親子互動空間場所資訊。資料來源：衛福部社會及家庭署開放資料。",
    faqs: [
      { question: "什麼是親子館（托育資源中心）？", answer: "親子館為政府補助設置的免費或平價育兒資源場所，提供學齡前幼兒親子活動空間、圖書玩具借閱、育兒諮詢與親職教育課程。" },
      { question: "資料來源是哪裡？", answer: "資料來源為衛福部社會及家庭署開放資料「全國親子館(托育資源中心)名冊」。" },
    ],
  },
  {
    slug: "child-welfare-centers",
    group: "child-welfare",
    title: "兒少福利中心查詢",
    description: "查詢全台兒童及少年福利服務中心一覽表，提供兒童與青少年個案輔導、社區關懷與家庭支持服務。資料來源：衛福部社會及家庭署開放資料。",
    faqs: [
      { question: "兒少福利服務中心提供哪些服務？", answer: "兒少福利服務中心提供兒童與青少年心理輔導、家庭支持、課後照顧、福利諮詢及兒少權益宣導等多項社會福利服務。" },
      { question: "資料來源是哪裡？", answer: "資料來源為衛福部社會及家庭署開放資料「兒童及少年福利服務中心一覽表」。" },
    ],
  },
];

// Sort TOOL_CATALOG globally by first character using Traditional Chinese localeCompare
TOOL_CATALOG.sort((a, b) => a.title.localeCompare(b.title, "zh-Hant", { numeric: true }));

/** Look up a tool's catalog entry by slug — throws if missing so a typo'd slug fails
 * loudly at build/request time instead of silently rendering blank title/description. */
export function getToolCatalogEntry(slug: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find((tool) => tool.slug === slug);
  if (!entry) {
    throw new Error(`No TOOL_CATALOG entry for slug "${slug}"`);
  }
  return entry;
}

