import type { FacilitySearchConfig } from "@/components/Facilities/FacilitySearchContent";

/**
 * Per-tool config for every government facility lookup under /tools that renders
 * via the shared `FacilitySearchContent` client component. Each page.tsx imports its
 * entry directly and passes it straight through — kept here as plain data (rather
 * than as one always-client wrapper component per facility type) since none of these
 * configs need state or hooks of their own.
 */
export const facilitySearchConfigs = {
  aed: {
    facilityType: "aed",
    emoji: "⚡",
    title: "全國公共場所 AED 急救地圖",
    description:
      "即時查詢全國公共場所自動體外心臟電擊去顫器 (AED) 設置地點、詳細放置位置、開放使用時間與緊急管理聯絡電話。資料來源：衛生福利部醫事司公共場所AED急救資訊網。",
    searchPlaceholder: "輸入場所名稱（如：高鐵、捷運、學校、活動中心）或地址",
    radiusMeters: 1000,
    errorText: "查詢 AED 資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近 1 公里內查無收錄的 AED，可改用關鍵字或擴大搜尋範圍。",
    emptyStateWithKeyword: "查無符合的 AED 設置地點。",
    serviceItem: { label: "📍 放置位置：" },
    showGeocodeNote: true,
    categories: [
      { value: "交通要道", label: "🚆 交通要道（高鐵/捷運/車站）" },
      { value: "觀光旅遊", label: "🏞️ 觀光旅遊場所" },
      { value: "學校", label: "🏫 學校與文教機構" },
      { value: "政府機關", label: "🏛️ 政府公務機關" },
      { value: "體育運動", label: "🏟️ 體育運動休閒場所" },
      { value: "商場", label: "🛒 大型商場與市集" },
    ],
  },
  clinics: {
    facilityType: "clinic",
    emoji: "🏥",
    title: "醫療院所查詢",
    description:
      "查詢全民健保特約醫療院所與健保違規重大、停約及五年不予特約名冊。資料來源：衛福部中央健康保險署。",
    searchPlaceholder: "輸入院所、醫師姓名、地址或縣市關鍵字",
    errorText: "查詢院所資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無已定位的院所，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的院所。",
    serviceItem: "badge",
    showWeeklyHours: true,
    categories: [
      { value: "醫學中心", label: "醫學中心" },
      { value: "區域醫院", label: "區域醫院" },
      { value: "地區醫院", label: "地區醫院" },
      { value: "基層診所", label: "基層診所" },
      { value: "違規／停約", label: "⚠️ 違規／停約名單" },
      { value: "避孕諮詢", label: "🛡️ 避孕諮詢診所" },
    ],
  },
  pharmacies: {
    facilityType: "pharmacy",
    emoji: "🏪",
    title: "藥局查詢",
    description:
      "查詢全台一般藥局及健保特約藥局。資料來源：衛福部食藥署藥局管理系統、中央健康保險署。",
    searchPlaceholder: "輸入藥局名稱或地址關鍵字（縣市、鄉鎮）",
    radiusMeters: 5000,
    errorText: "查詢藥局資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近 5 公里內查無已定位的藥局，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的藥局。",
    serviceItem: "badge",
    showWeeklyHours: true,
    showGeocodeNote: true,
    locationDefaultWarning:
      "⚠️ 無法取得您的定位，附近搜尋改用預設位置範圍；您也可以直接用上方關鍵字搜尋全台藥局。",
    categories: [
      { value: "健保特約藥局", label: "健保特約藥局" },
      { value: "一般藥局", label: "一般藥局" },
      { value: "避孕諮詢", label: "🛡️ 避孕諮詢藥局" },
    ],
  },
  "hakka-bogong": {
    facilityType: "hakka_community",
    emoji: "🧓",
    title: "客家委員會「伯公照護站」查詢",
    description:
      "查詢客家委員會「伯公照護站」名冊。資料來源：客家委員會開放資料。",
    searchPlaceholder: "輸入站點名稱、協會或縣市關鍵字",
    errorText: "查詢伯公照護站資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的伯公照護站，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的伯公照護站。",
  },
  "long-term-care": {
    facilityType: "long_term_care",
    emoji: "🤝",
    title: "長照服務機構查詢",
    description:
      "查詢全台長照服務機構與長照2.0特約機構，整合居家照顧、日間照顧、喘息服務、住宿型機構（含空床與評鑑）、失智共照、失智據點、家庭照顧者支持與社區照顧據點。資料來源：衛福部長照地理資訊系統。",
    searchPlaceholder: "輸入機構名稱、特約項目、地址或縣市關鍵字",
    errorText: "查詢長照機構資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的長照機構或據點，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的長照機構或據點。",
    serviceItem: { label: "服務項目：" },
    categories: [
      { value: "居家服務", label: "居家服務" },
      { value: "日間照顧", label: "日間照顧" },
      { value: "喘息服務", label: "喘息服務" },
      { value: "住宿", label: "住宿型機構 / 護理之家" },
      { value: "家庭托顧", label: "家庭托顧" },
      { value: "專業照護", label: "專業照護" },
      { value: "交通接送", label: "交通接送" },
      { value: "輔具", label: "輔具與居家無障礙改善" },
      { value: "巷弄長照站", label: "巷弄長照站" },
      { value: "小規模多機能", label: "小規模多機能" },
      { value: "失智共同照護", label: "🧠 失智共同照護中心" },
      { value: "失智社區服務", label: "🧩 失智社區服務據點" },
      { value: "家庭照顧者", label: "🤝 家庭照顧者支持據點" },
      { value: "社區照顧關懷據點", label: "🏡 社區照顧關懷據點" },
      { value: "預防及延緩失能", label: "🌱 預防及延緩失能" },
      // issue #612: data.gov.tw 115950「全國開業護理機構清冊」裡除了產後護理之家
      // （併為獨立工具 /tools/postpartum-care）之外的另兩類機構，併入本工具。
      { value: "一般護理之家", label: "🏥 一般護理之家" },
      { value: "居家護理所", label: "🏠 居家護理所" },
    ],
  },
  "postpartum-care": {
    // issue #612: data.gov.tw 115950「全國開業護理機構清冊」裡的產後護理之家
    // （241 家）——同一份資料集裡的一般護理之家／居家護理所併入 long-term-care
    // 的 categories（見上），不做成獨立工具。
    facilityType: "postpartum_care",
    emoji: "🤱",
    title: "產後護理之家地圖",
    description:
      "查詢全台產後護理之家（月子中心），顯示產後護理床與嬰兒床開放床數、評鑑結果與合格效期，協助確認機構是否仍在有效期內。資料來源：衛福部護理及健康照護司全國開業護理機構清冊。",
    searchPlaceholder: "輸入機構名稱、地址或縣市關鍵字",
    errorText: "查詢產後護理之家資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的產後護理之家，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的產後護理之家。",
    extraFields: [
      { key: "postpartumBeds", label: "🛏️ 產後護理床：" },
      { key: "infantBeds", label: "👶 嬰兒床：" },
    ],
  },
  "vet-clinics": {
    facilityType: "vet_clinic",
    emoji: "🐾",
    title: "全台動物醫院與獸醫診所查詢",
    description:
      "查詢全台各縣市開業之合法獸醫診療機構與動物醫院。資料來源：農業部動植物防疫檢疫署開放資料。",
    searchPlaceholder: "輸入動物醫院名稱、地址或執照字號",
    errorText: "查詢動物醫院資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的動物醫院，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的動物醫院。",
    serviceItem: "badge",
    categories: [
      { value: "獸醫師", label: "獸醫師執業" },
      { value: "獸醫佐", label: "獸醫佐執業" },
    ],
  },
  "elder-welfare": {
    facilityType: "elder_welfare",
    emoji: "👵",
    title: "老人福利機構查詢",
    description:
      "查詢衛福部全國老人福利機構名冊（安養、養護、長照等機構）。資料來源：衛福部社會及家庭署開放資料。",
    searchPlaceholder: "輸入機構名稱或縣市關鍵字",
    errorText: "查詢機構資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的老人福利機構，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的機構。",
    serviceItem: { label: "收容對象：" },
    // Values surveyed live off /api/facilities?type=elder_welfare (issue #132) — a row's
    // 收容對象 can list more than one (e.g. "養護、長照"), matched via the shared
    // LIKE-based category filter.
    categories: [
      { value: "安養", label: "安養" },
      { value: "養護", label: "養護" },
      { value: "長照", label: "長照" },
      { value: "失智", label: "失智照護" },
    ],
  },
  "disability-welfare": {
    facilityType: "disability_welfare",
    emoji: "🧑‍🦽",
    title: "身心障礙福利機構查詢",
    description:
      "查詢衛福部全國身心障礙福利機構名冊。資料來源：衛福部社會及家庭署開放資料。",
    searchPlaceholder: "輸入機構名稱或縣市關鍵字",
    errorText: "查詢機構資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的身心障礙福利機構，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的機構。",
    serviceItem: { label: "機構類型：" },
    // Values surveyed live off /api/facilities?type=disability_welfare (issue #132).
    categories: [
      { value: "全日型住宿式機構", label: "全日型住宿式機構" },
      { value: "夜間型住宿式機構", label: "夜間型住宿式機構" },
      { value: "日間型機構", label: "日間型機構" },
      { value: "身心障礙庇護工場", label: "身心障礙庇護工場" },
      { value: "福利服務中心", label: "福利服務中心" },
      { value: "身心障礙日間作業設施", label: "身心障礙日間作業設施" },
    ],
    // "是否有愛心義賣" (issue #132) — extra_json.charityUrl is set for the ~62 institutions
    // scripts/enrich-disability-charity-sales.mjs matched to a charity-sale listing; already
    // shown on every card as the 🛍️ badge (see FacilitySearchContent.tsx), this just adds a
    // way to filter down to only those.
    charityFilter: { label: "只顯示有愛心義賣的機構" },
  },
  "disability-atm": {
    facilityType: "disability_atm",
    emoji: "🏧",
    title: "信用合作社無障礙ATM查詢",
    description:
      "查詢全台信用合作社提供輪椅可及或語音服務的無障礙ATM。資料來源：中華民國信用合作社聯合社。",
    searchPlaceholder: "輸入信合社名稱或縣市關鍵字",
    errorText: "查詢ATM資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的無障礙ATM，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的ATM。",
    serviceItem: "badge",
    categories: [
      { value: "輪椅可及", label: "輪椅可及" },
      { value: "語音服務", label: "語音服務" },
    ],
  },
  "health-checks": {
    facilityType: "health_check",
    emoji: "🩻",
    title: "健康檢查機構查詢",
    description:
      "查詢勞工健康檢查認可醫療機構及職業傷病防治網絡醫院。資料來源：勞動部。",
    noteLine: "⚠️ 老人免費健檢機構資料源目前無法連線，暫未收錄。",
    searchPlaceholder: "輸入機構名稱或縣市關鍵字",
    errorText: "查詢機構資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無已定位的機構，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的機構。",
    serviceItem: { label: "認可項目：" },
    showGeocodeNote: true,
    // Values surveyed live off /api/facilities?type=health_check across 5 geographic
    // centers (issue #132). The mol_labor_checkup source's raw 認可類別及有效期限 field
    // packs a validity date range onto each item (e.g. "一般健檢(1150101~1171231)"), and a
    // "巡迴"-prefixed traveling variant exists for several of them (e.g. "巡迴一般健檢(...)") —
    // the shared LIKE-based category filter matches the base term regardless of the trailing
    // date range, and (as an accepted side effect, same tradeoff as disability-atm's combined
    // badges) also surfaces the matching 巡迴 variant since it's a superset string.
    categories: [
      { value: "一般健檢", label: "一般健檢" },
      { value: "特殊健檢", label: "特殊健檢" },
      { value: "特殊粉塵健檢", label: "特殊粉塵健檢" },
      { value: "特殊噪音健檢", label: "特殊噪音健檢" },
      { value: "異常氣壓健檢", label: "異常氣壓健檢" },
      { value: "成人預防保健", label: "成人預防保健" },
      { value: "職業傷病防治網絡醫院", label: "職業傷病防治網絡醫院" },
    ],
  },
  "home-healthcare": {
    facilityType: "home_healthcare",
    emoji: "🏠",
    title: "居家醫療查詢",
    description:
      "查詢提供居家醫療照護服務的全民健保特約機構。資料來源：衛福部中央健康保險署。",
    searchPlaceholder: "輸入機構名稱或縣市關鍵字",
    errorText: "查詢機構資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的機構，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的機構。",
    serviceItem: "badge",
  },
  "public-toilets": {
    facilityType: "public_toilet",
    emoji: "🚻",
    title: "全國公廁查詢",
    description: "查詢全國公廁位置、無障礙與親子設施。資料來源：環境部全國公廁建檔資料（fac_p_07）。",
    searchPlaceholder: "輸入地點名稱或縣市關鍵字",
    errorText: "查詢公廁資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的公廁，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的公廁。",
  },
  "green-shops": {
    facilityType: "green_shop",
    emoji: "🌿",
    title: "全國綠色商店與環保標章商品地圖",
    description:
      "查詢環境部認證通過之綠色商店、環保餐廳與碳足跡標籤通路據點，支持綠色消費與友善環境生活。資料來源：環境部綠生活開放資料。",
    searchPlaceholder: "輸入商店名稱、量販超市或地址關鍵字",
    errorText: "查詢綠色商店失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無認證的綠色商店，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的綠色商店。",
    serviceItem: { label: "綠色商店認證類型：" },
  },
  "green-hotels": {
    facilityType: "green_hotel",
    emoji: "🏨",
    title: "環保標章旅館與綠色住宿查詢",
    description:
      "查詢環境部認證之全國金級、銀級、銅級環保標章旅館及綠色旅店名冊。資料來源：環境部開放資料（gp_p_42, gp_p_43）與台北市政府觀傳局。",
    searchPlaceholder: "輸入旅館名稱、飯店或縣市關鍵字",
    errorText: "查詢環保旅館資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的環保旅館，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的環保旅館。",
    serviceItem: { label: "標章等級：" },
    categories: [
      { value: "金級", label: "金級環保旅館" },
      { value: "銀級", label: "銀級環保旅館" },
      { value: "銅級", label: "銅級環保旅館" },
    ],
  },
  "child-welfare-nurseries": {
    facilityType: "child_welfare_nursery",
    emoji: "🧸",
    title: "全國親子館查詢",
    description:
      "查詢全國親子館（托育資源中心）名冊，提供育兒資源與親子互動空間場所資訊。資料來源：衛福部社會及家庭署開放資料。",
    searchPlaceholder: "輸入親子館名稱或縣市關鍵字",
    errorText: "查詢親子館資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的親子館，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的親子館。",
  },
  "child-welfare-centers": {
    facilityType: "child_welfare_center",
    emoji: "👶",
    title: "兒少福利中心查詢",
    description:
      "查詢全台兒童及少年福利服務中心一覽表，提供兒童與青少年個案輔導、社區關懷與家庭支持服務。資料來源：衛福部社會及家庭署開放資料。本表為衛生福利部公告之公設民營兒少福利服務中心，不含安置及教養機構。",
    searchPlaceholder: "輸入中心名稱或縣市關鍵字",
    errorText: "查詢兒少福利中心資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的兒少福利中心，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的中心。",
  },
  kindergartens: {
    facilityType: "kindergarten",
    emoji: "🏫",
    title: "全國幼兒園查詢",
    description:
      "查詢全國公立、私立、準公共與非營利幼兒園名錄。資料來源：教育部開放資料。",
    // issue #602: category/月費/裁罰紀錄欄位來自民間轉錄 kiang/ap.ece.moe.edu.tw
    // 的 preschools.json（MIT 授權，轉錄自全國教保資訊網），並非教育部官方
    // k1_new.json 本身的欄位；該民間轉錄逾 60 天未更新時會自動停用，屆時這些
    // 園所僅會顯示教育部原始的公/私立二分類。
    noteLine:
      "非營利／準公共標記、月費與裁罰紀錄來自民間轉錄（kiang/ap.ece.moe.edu.tw，MIT 授權），非教育部官方欄位；若該轉錄超過 60 天未更新，將自動改回僅顯示教育部公/私立二分類。",
    searchPlaceholder: "輸入幼兒園名稱或縣市關鍵字",
    errorText: "查詢幼兒園資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的幼兒園，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的幼兒園。",
    serviceItem: { label: "設立別與核定人數：" },
    categories: [
      { value: "公立", label: "公立幼兒園" },
      { value: "私立", label: "私立幼兒園" },
      { value: "非營利", label: "非營利幼兒園" },
      { value: "準公共", label: "準公共幼兒園" },
    ],
    extraFields: [{ key: "monthlyFee", label: "月費（元）：" }],
  },
  "cram-schools": {
    facilityType: "cram_school",
    emoji: "📚",
    title: "全國短期補習班查詢",
    description:
      "查詢全台 22 縣市立案短期補習班名冊。資料來源：教育部短期補習班資訊管理系統。",
    searchPlaceholder: "輸入補習班名稱、類科或縣市關鍵字",
    errorText: "查詢補習班資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的補習班，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的補習班。",
    serviceItem: { label: "補習班類科：" },
    categories: [
      { value: "文理", label: "文理類" },
      { value: "外語", label: "外語類" },
      { value: "技藝", label: "技藝類" },
    ],
  },
  "cool-spots": {
    facilityType: "cool_spot",
    emoji: "🧊",
    title: "全國涼適點查詢",
    description:
      "查詢環境部「Cool Map 涼適點」名冊，提供百貨、圖書館、里民活動中心等可供民眾避暑消暑之場所。資料來源：環境部開放資料（gis_p_82）。",
    searchPlaceholder: "輸入地點名稱或縣市關鍵字",
    errorText: "查詢涼適點資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的涼適點，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的涼適點。",
    serviceItem: { label: "設施資訊：" },
  },
  "iaq-premises": {
    facilityType: "iaq_premise",
    emoji: "💨",
    title: "室內空氣品質法公告場所查詢",
    description:
      "查詢應符合《室內空氣品質管理法》之公告場所名冊。資料來源：環境部開放資料（aqx_p_23）。",
    searchPlaceholder: "輸入場所名稱或縣市關鍵字",
    errorText: "查詢場所資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的場所，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的場所。",
    serviceItem: { label: "場所類別：" },
    showGeocodeNote: true,
  },
  "cleaning-squads": {
    facilityType: "cleaning_squad",
    emoji: "🧹",
    title: "地方清潔隊聯絡資訊查詢",
    description:
      "查詢全國各縣市地方清潔隊聯絡地址與電話。資料來源：環境部開放資料（wr_s_04）。",
    searchPlaceholder: "輸入清潔隊名稱或縣市關鍵字",
    errorText: "查詢清潔隊資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的清潔隊，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的清潔隊。",
    showGeocodeNote: true,
  },
  "green-restaurants": {
    facilityType: "green_restaurant",
    emoji: "🍽️",
    title: "環保餐廳查詢",
    description:
      "查詢環境部「環保餐廳環境即時通」地圖名冊。資料來源：環境部開放資料（gis_p_11）。",
    searchPlaceholder: "輸入餐廳名稱或縣市關鍵字",
    errorText: "查詢環保餐廳資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的環保餐廳，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的環保餐廳。",
  },
  "child-safety-spots": {
    facilityType: "child_safety_spot",
    emoji: "🛡️",
    title: "婦幼安全警示地點查詢",
    description:
      "查詢內政部警政署公告之全國婦幼安全警示地點與路段。本表為警示路段與地點描述，多數非門牌地址（如捷運站、公園、路口周邊），約 87% 尚未完成地理定位，未定位者不會出現在附近搜尋結果中，請改用關鍵字搜尋。資料來源：內政部警政署開放資料。",
    searchPlaceholder: "輸入路段、地點或分局關鍵字",
    errorText: "查詢警示地點資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的警示地點，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的警示地點。",
    serviceItem: { label: "管轄單位與窗口：" },
    showGeocodeNote: true,
  },
  bookstores: {
    facilityType: "bookstore",
    emoji: "📚",
    title: "全國實體書店查詢",
    description: "查詢全國特色實體書店、獨立書局與閱讀空間。資料來源：文化部開放資料（typeId=M）。",
    searchPlaceholder: "輸入書店名稱或縣市關鍵字",
    errorText: "查詢書店資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的實體書店，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的實體書店。",
    serviceItem: { label: "營業時間：" },
  },
  "tourism-factories": {
    facilityType: "tourism_factory",
    emoji: "🏭",
    title: "全台認證觀光工廠查詢",
    description:
      "查詢經濟部產業發展署評鑑通過之全台觀光工廠與產業文化館。資料來源：經濟部產業發展署開放資料（SDD6848）。",
    searchPlaceholder: "輸入工廠名稱或縣市關鍵字",
    errorText: "查詢觀光工廠資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的觀光工廠，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的觀光工廠。",
    serviceItem: { label: "地區分類：" },
    categories: [
      { value: "北部", label: "北部地區" },
      { value: "中部", label: "中部地區" },
      { value: "南部", label: "南部地區" },
      { value: "東部", label: "東部地區" },
    ],
  },
  "sheltered-workshops": {
    facilityType: "sheltered_workshop",
    emoji: "🤲",
    title: "全國庇護工場與身障展售地圖",
    description:
      "查詢全國各縣市庇護工場、身心障礙朋友手作良品、公益禮盒與就業支持據點。資料來源：勞動部勞動力發展署。",
    searchPlaceholder: "輸入工場名稱、產品（烘焙/咖啡/清潔）或地址關鍵字",
    errorText: "查詢庇護工場資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的庇護工場，可改用關鍵字或擴大搜尋範圍。",
    emptyStateWithKeyword: "查無符合的庇護工場。",
    serviceItem: { label: "主打商品與服務：" },
  },
  "mental-health": {
    facilityType: "mental_health",
    emoji: "🧠",
    title: "全國心理諮商所與心衛中心地圖",
    description:
      "查詢衛生福利部合法立案之心理諮商所、臨床心理所與社區心理衛生中心。提供安心專線 1925、心理諮詢與預約資訊。資料來源：衛生福利部心理健康司。",
    searchPlaceholder: "輸入機構名稱、諮商所或縣市關鍵字",
    errorText: "查詢心理諮商機構失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無已收錄的心理諮商所，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的心理諮商機構。",
    serviceItem: { label: "諮商服務項目：" },
  },
  "addiction-treatment": {
    facilityType: "addiction_treatment",
    emoji: "💊",
    title: "全國藥癮戒治與替代治療機構查詢",
    description:
      "查詢全國藥癮戒治機構、替代治療機構及非鴉片類藥癮治療補助機構，顯示戒治機構模式與服務內容。資料來源：衛生福利部（data.gov.tw 133353，臺北市立聯合醫院上架）。",
    searchPlaceholder: "輸入機構名稱或縣市關鍵字",
    errorText: "查詢藥癮戒治機構失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的藥癮戒治機構，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的藥癮戒治機構。",
    showGeocodeNote: true,
    // #566: 這兩個欄位在 facilities 表沒有通用對應欄位，放在 extra_json 裡，透過
    // FacilitySearchContent 的通用 extraFields 顯示。#571 補上美沙冬跨區給藥院所和
    // 各縣市毒品危害防制中心時，若有各自的額外欄位，可以用同一個機制加，不需要
    // 再動 FacilitySearchContent。
    extraFields: [
      { key: "addictionTreatmentMode", label: "戒治機構模式：" },
      { key: "addictionTreatmentService", label: "戒治服務內容：" },
    ],
  },
  "methadone-cross-district": {
    facilityType: "methadone_cross_district",
    emoji: "🧭",
    title: "美沙冬跨區給藥院所查詢",
    description:
      "查詢可提供跨區給藥服務的美沙冬院所，顯示平日／假日／其他給藥時段與各項費用，方便接受治療者出差或旅行時不中斷用藥。資料來源：衛生福利部（data.gov.tw 133345，臺北市立聯合醫院上架）。",
    searchPlaceholder: "輸入機構名稱或縣市關鍵字",
    errorText: "查詢美沙冬跨區給藥院所失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的美沙冬跨區給藥院所，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的美沙冬跨區給藥院所。",
    showGeocodeNote: true,
    // #571: 沿用 #566 建立的通用 extraFields 顯示機制——給藥時段（平日／假日／
    // 其他）與各項跨區給藥費用在 facilities 表都沒有通用對應欄位，放在 extra_json
    // 裡顯示。
    extraFields: [
      { key: "methadoneWeekdayDosingTime", label: "平日給藥時間：" },
      { key: "methadoneHolidayDosingTime", label: "假日給藥時間：" },
      { key: "methadoneOtherDosingTime", label: "其他給藥時間：" },
      { key: "methadoneCrossDistrictFee", label: "跨區給藥服務費：" },
      { key: "methadoneTransferInFee", label: "轉入掛號費：" },
      { key: "methadoneTransferOutFee", label: "轉出掛號費：" },
      { key: "methadoneEvaluationFee", label: "跨區給藥評估費：" },
      { key: "methadoneNotes", label: "注意事項：" },
    ],
  },
  "anti-drug-center": {
    facilityType: "anti_drug_center",
    emoji: "🏢",
    title: "各縣市毒品危害防制中心查詢",
    description:
      "查詢全台 22 縣市的毒品危害防制中心地址，提供電話諮詢、心理支持、法律諮詢、就業轉介等協助。資料來源：法務部反毒大本營「各地方毒防中心」。",
    searchPlaceholder: "輸入縣市關鍵字",
    errorText: "查詢毒品危害防制中心失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的毒品危害防制中心，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的毒品危害防制中心。",
    showGeocodeNote: true,
  },
  "smoking-cessation": {
    facilityType: "smoking_cessation",
    emoji: "🚭",
    title: "全國戒菸治療與衛教特約院所查詢",
    description:
      "查詢全國提供二代戒菸補助之特約醫院、基層診所與社區藥局。享戒菸藥品免部分負擔及衛教諮詢。資料來源：衛生福利部國民健康署「各縣市合約戒菸醫療院所」（2,838 家）。",
    // issue #569（parent #562）：國健署 6954 全國表已上線同步，取代原本只有 6
    // 筆手寫資料時的「部分示例」警示文字。noteLine 改為顯示資料本身的日期
    // （各筆 extra_json.dataAsOf，本站同步當天的日期）而非再次提醒資料不完整。
    searchPlaceholder: "輸入院所、藥局名稱或地址關鍵字",
    errorText: "查詢戒菸特約院所失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的戒菸特約院所，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的戒菸院所。",
    serviceItem: { label: "機構類別：" },
    categories: [
      { value: "醫學中心", label: "醫學中心" },
      { value: "區域醫院", label: "區域醫院" },
      { value: "地區醫院", label: "地區醫院" },
      { value: "診所", label: "診所" },
      { value: "牙科診所", label: "牙科診所" },
      { value: "藥局", label: "藥局" },
      { value: "衛生所", label: "衛生所" },
    ],
    extraFields: [
      { key: "smokingMedication", label: "戒菸給藥：" },
      { key: "smokingEducation", label: "戒菸衛教：" },
      { key: "dataAsOf", label: "本站資料同步日期：" },
    ],
  },
  "adult-preventive-care": {
    facilityType: "adult_preventive_care",
    emoji: "🩺",
    title: "成人健檢與公費癌症篩檢特約院所",
    description:
      "查詢全國提供 40 歲以上成人預防保健與子宮頸癌、乳癌、大腸癌、口腔癌公費四癌篩檢特約醫療院所。資料來源：衛生福利部國民健康署。",
    searchPlaceholder: "輸入醫院、診所名稱或縣市關鍵字",
    errorText: "查詢成人健檢特約院所失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的健檢院所，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的健檢院所。",
    serviceItem: { label: "公費健檢項目：" },
  },
  "baby-friendly-hospitals": {
    facilityType: "baby_friendly_hospital",
    emoji: "🤱",
    title: "母嬰親善醫療院所地圖",
    description:
      "查詢臺北市、新北市、臺中市、臺南市、彰化縣五縣市衛生局公告之母嬰親善醫療院所名單，並自動排除已過有效期的紀錄。目前僅收錄這五個縣市——其餘縣市（例如高雄市，現有公告效期已全數落在 2016～2019 年、不堪作為現行名單使用）尚未收錄；若所在縣市未列出或查無有效名單，請直接洽當地衛生局確認最新名冊。",
    noteLine:
      "各縣市資料查證於 2026-10-14：臺北市（19 家原始筆數，依效期逐筆過濾）、新北市（20 家，名冊標示 2026-02 更新）、臺中市（18 家）、臺南市（11 家，含座標）、彰化縣（5 家，效期至民國 116 年底／2027 年底）。",
    searchPlaceholder: "輸入婦產科、醫院名稱或地址關鍵字",
    errorText: "查詢母嬰親善醫療院所失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的母嬰親善院所，可改用關鍵字或地區快篩搜尋。",
    emptyStateWithKeyword: "查無符合的母嬰親善院所。",
    emptyStateCounty: "本縣市暫無有效名單，請洽當地衛生局。",
    serviceItem: { label: "親善特色：" },
  },
  "rare-disease-care": {
    facilityType: "rare_disease_care",
    emoji: "🧬",
    title: "罕見疾病照護諮詢中心與確診醫院",
    description:
      "查詢國民健康署指定之罕見疾病照護諮詢中心、遺傳諮詢窗口與重大罕病確診醫療機構。資料來源：衛生福利部國民健康署。",
    searchPlaceholder: "輸入醫學中心、罕病中心或縣市關鍵字",
    errorText: "查詢罕病中心資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的罕病諮詢中心，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的罕見疾病機構。",
    serviceItem: { label: "照護諮詢範圍：" },
  },
  "organ-donation-hospitals": {
    facilityType: "organ_donation_hospital",
    emoji: "❤️",
    title: "器官捐贈勸募網絡指定醫院查詢",
    description:
      "查詢全國器官捐贈勸募網絡責任醫院名冊、器捐移植團隊與健保卡器捐意願註記簽署諮詢處。資料來源：衛生福利部醫事司。",
    searchPlaceholder: "輸入醫院名稱或縣市關鍵字",
    errorText: "查詢器捐醫院失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無器官捐贈指定醫院，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的器官捐贈醫院。",
    serviceItem: { label: "器捐責任網絡：" },
  },
  "home-emergency-care": {
    facilityType: "home_emergency_care",
    emoji: "🏡",
    title: "健保在宅急症照護特約機構查詢",
    description:
      "查詢衛生福利部健保署在宅急症照護試辦計畫特約院所，針對肺炎、尿路感染、軟組織感染提供在宅施打抗生素與遠距監控服務。資料來源：衛生福利部中央健康保險署。",
    searchPlaceholder: "輸入醫療團隊、醫院名稱或縣市關鍵字",
    errorText: "查詢在宅急症機構失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的在宅急症機構，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的在宅急症機構。",
    serviceItem: { label: "在宅急症適應症：" },
  },
  "pesticide-sales": {
    facilityType: "pesticide_sales",
    emoji: "🌱",
    title: "全國合法農藥與植物保護資材據點",
    description:
      "查詢農業部動植物防疫檢疫署核發合法執照之農藥販賣業與植物保護資材營業據點。資料來源：農業部動植物防疫檢疫署。",
    searchPlaceholder: "輸入資材行名稱、鄉鎮或地址關鍵字",
    errorText: "查詢農藥資材據點失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無合法農藥販售據點，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的農藥資材行。",
    serviceItem: { label: "執照核准項目：" },
  },
  "hearing-aid-subsidies": {
    facilityType: "hearing_aid_subsidy",
    emoji: "🦻",
    title: "助聽器評估特約醫療院所名冊",
    description:
      "查詢衛福部社會及家庭署身心障礙輔具補助指定之助聽器聽力檢查與效益驗證特約醫療院所。資料來源：衛生福利部社會及家庭署。",
    searchPlaceholder: "輸入醫院名稱或聽力中心關鍵字",
    errorText: "查詢助聽器評估院所失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無助聽器評估特約院所，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的助聽器特約院所。",
    serviceItem: { label: "輔具評估項目：" },
  },
  "funeral-facilities": {
    facilityType: "funeral_facility",
    emoji: "🕊️",
    title: "全國合法公私立殯葬設施與生命禮儀",
    description:
      "查詢內政部民政司全國合法登記立案之公立與私立公墓、納骨塔（骨灰骸存放設施）、火化場與生命禮儀業者。資料來源：內政部全國殯葬資訊網。",
    searchPlaceholder: "輸入設施名稱（殯儀館/靈骨塔/生命會館）或縣市關鍵字",
    errorText: "查詢殯葬設施失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無合法殯葬設施，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的殯葬設施。",
    serviceItem: { label: "殯葬設施類別：" },
  },
  "audible-signals": {
    facilityType: "audible_signal",
    emoji: "🔊",
    title: "全國盲人有聲號誌查詢",
    description:
      "查詢全國各縣市盲人有聲號誌（行人穿越道語音號誌）設置路口，顯示路名與是否支援 App 觸發。資料來源：TDX 運輸資料流通服務平台。",
    searchPlaceholder: "輸入路名或縣市關鍵字",
    errorText: "查詢有聲號誌資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的有聲號誌路口，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的有聲號誌路口。",
    serviceItem: "badge",
  },
  "accessible-parking": {
    facilityType: "accessible_parking",
    emoji: "🅿️",
    title: "孕婦親子／身心障礙／復康巴士車位查詢",
    description:
      "查詢全台停車場（路外）與路邊停車（路內）的孕婦及親子專用、身心障礙汽車、身心障礙機車與復康巴士專用車位，顯示即時剩餘車位數。資料來源：TDX 運輸資料流通服務平台。",
    searchPlaceholder: "輸入停車場名稱、路段或縣市關鍵字",
    errorText: "查詢特殊車位資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的特殊車位，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的特殊車位。",
    serviceItem: "badge",
    categories: [
      { value: "孕婦及親子專用車位", label: "🤰 孕婦及親子專用" },
      { value: "身心障礙汽車車位", label: "♿ 身心障礙汽車" },
      { value: "身心障礙機車車位", label: "🛵 身心障礙機車" },
      { value: "復康巴士", label: "🚐 復康巴士" },
    ],
  },
  "early-intervention": {
    facilityType: "early_intervention_unit",
    emoji: "🧒",
    title: "早期療育資源地圖",
    description:
      "查詢全國早期療育單位（衛生／社福／教育）與縣市兒童發展聯合評估中心，支援依單位別、服務方式篩選。資料來源：衛生福利部社會及家庭署（data.gov.tw 130229）及臺北市、新北市、高雄市政府開放資料。",
    noteLine: "聯合評估中心用於正式發展評估與鑑定；早療單位則提供實際療育服務——懷疑孩子發展遲緩，可先至聯合評估中心評估，再依評估結果就近安排早療單位。",
    searchPlaceholder: "輸入單位名稱或縣市關鍵字",
    errorText: "查詢早期療育資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的早療單位，可改用關鍵字或擴大搜尋範圍。",
    emptyStateWithKeyword: "查無符合的早療單位。",
    serviceItem: { label: "單位別：" },
    categories: [
      { value: "衛生單位", label: "🏥 衛生單位" },
      { value: "社福單位", label: "🤝 社福單位" },
      { value: "教育單位", label: "🏫 教育單位" },
      { value: "聯合評估中心", label: "🩺 聯合評估中心" },
    ],
    serviceMethodFilter: {
      ariaLabel: "服務方式篩選",
      allLabel: "全部服務方式",
      options: [
        { value: "時段", label: "⏰ 時段療育" },
        { value: "日間", label: "☀️ 日間療育" },
        { value: "到宅", label: "🏠 到宅服務" },
      ],
    },
    extraFields: [
      { key: "serviceMethod", label: "服務方式：" },
      { key: "serviceContent", label: "療育服務內容：" },
      { key: "centerType", label: "機構類型：" },
      { key: "note", label: "備註：" },
    ],
  },
  // issue #601 (parent #599): 托嬰中心與居家托育地圖，先用臺北／新北兩個縣市把
  // 骨架建好。childcare_center 與 home_childcare_center 是兩個不同的 facilityType
  // （托嬰機構本身 vs. 協助家長找保母的居家托育服務中心媒合窗口），各自一個
  // config entry，由頁面用類型分頁切換——跟 long-term-care 合併 4 種類型的既有
  // 模式一樣。
  "childcare-centers": {
    facilityType: "childcare_center",
    emoji: "🍼",
    title: "全國托嬰中心查詢（六都）",
    description:
      "查詢臺北市、新北市、桃園市、臺中市、臺南市、高雄市托嬰中心名冊，依公辦民營、社區公共托育家園、準公共、私立分類，有資料的縣市顯示核定／實際收托人數、評鑑結果與月費等資訊。資料來源：各市政府社會局開放資料。目前僅涵蓋六都，其餘縣市查詢請改用衛福部社家署全國系統性查詢（ncwisweb.sfaa.gov.tw）。高雄市資料筆數偏少且停留在2025年6月，可能未反映最新全量名冊，詳見各筆資料下方標示。",
    searchPlaceholder: "輸入托嬰中心名稱、行政區或地址關鍵字",
    errorText: "查詢托嬰中心資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的托嬰中心，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的托嬰中心。",
    serviceItem: { label: "分類：" },
    showGeocodeNote: true,
    categories: [
      { value: "公辦民營", label: "🏛️ 公辦民營" },
      { value: "社區公共托育家園", label: "🏡 社區公共托育家園" },
      { value: "準公共", label: "🤝 準公共" },
      { value: "私立", label: "🏢 私立" },
    ],
    // approvedCapacity/actualCapacity/evaluationResult/monthlyFee/
    // registrationFee/mealFee/dataNote are only ever present on rows whose
    // source actually has that column — e.g. 121981/168385 有評鑑結果,
    // 83669/168379/168385 有月費, 6178 有月費/註冊費/副食品費但沒有評鑑結果,
    // 126984/126986/126222 全都沒有 — FacilitySearchContent 的 extraFields
    // 只在 extra_json 真的有該欄位時才顯示，所以沒有資料的縣市不會出現 "N/A"
    // 之類的空白佔位。dataNote 目前只有高雄（128099/128100）會設定，用來標示
    // 「資料可能不完整」，見 kaohsiungChildcare.ts。
    extraFields: [
      { key: "approvedCapacity", label: "核定收托人數：" },
      { key: "actualCapacity", label: "實際收托人數：" },
      { key: "evaluationResult", label: "評鑑結果：" },
      { key: "monthlyFee", label: "月費：" },
      { key: "registrationFee", label: "註冊／教材費：" },
      { key: "mealFee", label: "副食品費：" },
      { key: "dataAsOf", label: "本站資料同步日期：" },
    ],
  },
  "home-childcare-centers": {
    facilityType: "home_childcare_center",
    emoji: "👩‍👧",
    title: "全國居家托育服務中心查詢（臺北／新北）",
    description:
      "查詢臺北市、新北市居家托育服務中心（找保母的窗口），提供轄區保母媒合、訪視輔導與托育諮詢服務。資料來源：臺北市政府社會局、新北市政府社會局開放資料。目前僅涵蓋臺北、新北，其餘縣市查詢請改用衛福部社家署全國系統性查詢（ncwisweb.sfaa.gov.tw）。",
    searchPlaceholder: "輸入中心名稱、行政區或地址關鍵字",
    errorText: "查詢居家托育服務中心資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的居家托育服務中心，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的居家托育服務中心。",
    showGeocodeNote: true,
    extraFields: [{ key: "dataAsOf", label: "本站資料同步日期：" }],
  },
} satisfies Record<string, FacilitySearchConfig>;
