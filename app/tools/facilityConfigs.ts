import type { FacilitySearchConfig } from "@/components/Facilities/FacilitySearchContent";

/**
 * Per-tool config for every government facility lookup under /tools that renders
 * via the shared `FacilitySearchContent` client component. Each page.tsx imports its
 * entry directly and passes it straight through — kept here as plain data (rather
 * than as one always-client wrapper component per facility type) since none of these
 * configs need state or hooks of their own.
 */
export const facilitySearchConfigs = {
  clinics: {
    facilityType: "clinic",
    emoji: "🏥",
    title: "醫療院所查詢",
    description:
      "查詢全民健保特約醫療院所。資料來源：衛福部中央健康保險署（目前收錄醫學中心、區域醫院、地區醫院）。",
    searchPlaceholder: "輸入院所名稱或縣市關鍵字",
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
  "ltc-contracted": {
    facilityType: "ltc_contracted",
    emoji: "🤝",
    title: "長照特約服務機構查詢",
    description:
      "查詢衛福部長照2.0特約服務機構，涵蓋居家服務、日間照顧、喘息服務等契約服務項目。資料來源：衛福部長照服務資訊網。",
    searchPlaceholder: "輸入機構名稱或縣市關鍵字",
    errorText: "查詢機構資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的長照特約服務機構，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的機構。",
    serviceItem: { label: "特約服務項目：" },
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
  "long-term-care": {
    facilityType: "long_term_care",
    emoji: "🏡",
    title: "長照機構查詢",
    description:
      "查詢衛福部許可全台長期照顧服務機構。資料來源：衛福部長照服務地圖。",
    searchPlaceholder: "輸入機構名稱或縣市關鍵字",
    errorText: "查詢機構資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的長照機構，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的機構。",
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
    emoji: "🌱",
    title: "綠色商店查詢",
    description: "查詢環境部認證綠色商店。資料來源：環境部綠色商店基本資料（gp_p_01）。",
    searchPlaceholder: "輸入商店名稱或縣市關鍵字",
    errorText: "查詢商店資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的綠色商店，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的商店。",
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
  "green-products": {
    facilityType: "green_product",
    emoji: "🏷️",
    title: "環保標章產品查詢",
    description:
      "查詢環境部認證之各類綠色環保標章產品（低污染、省能資源、可回收）。資料來源：環境部開放資料（gp_p_02）。",
    searchPlaceholder: "輸入產品名稱、型號、廠商或類別關鍵字",
    errorText: "查詢環保產品資料失敗，請稍後再試。",
    emptyStateNoKeyword: "可輸入產品名稱、型號或廠商名稱進行搜尋。",
    emptyStateWithKeyword: "查無符合的環保產品。",
    serviceItem: { label: "產品類別與廠商：" },
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
    searchPlaceholder: "輸入幼兒園名稱或縣市關鍵字",
    errorText: "查詢幼兒園資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的幼兒園，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的幼兒園。",
    serviceItem: { label: "設立別與核定人數：" },
    categories: [
      { value: "公立", label: "公立幼兒園" },
      { value: "私立", label: "私立幼兒園" },
      { value: "非營利", label: "非營利幼兒園" },
    ],
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
  "tax-organizations": {
    facilityType: "tax_organization",
    emoji: "🏢",
    title: "非營利組織(NPO)查詢",
    description:
      "查詢全國非營利組織（NPO）、機關團體、協會、社會福利慈善財團法人與管委會名冊。資料來源：財政部財政資訊中心開放資料。本表已支援地址自動地理定位與附近搜尋。",
    searchPlaceholder: "輸入 8 碼統一編號、組織名稱或所在縣市",
    errorText: "查詢非營利組織資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無已收錄的非營利組織，可輸入統一編號、機構團體名稱或縣市關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的非營利組織。",
    serviceItem: { label: "異動狀態與事由：" },
    showGeocodeNote: true,
  },
} satisfies Record<string, FacilitySearchConfig>;
