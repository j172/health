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
      "查詢全台長照服務機構與長照2.0特約機構，涵蓋居家服務、日間照顧、喘息服務、住宿型長照機構與社區照顧據點。資料來源：衛福部長照服務資訊網及各地方政府開放資料。",
    searchPlaceholder: "輸入機構名稱、特約項目或縣市關鍵字",
    errorText: "查詢長照機構資料失敗，請稍後再試。",
    emptyStateNoKeyword: "附近查無收錄的長照機構，可改用關鍵字搜尋。",
    emptyStateWithKeyword: "查無符合的長照機構。",
    serviceItem: { label: "服務項目：" },
    categories: [
      { value: "居家服務", label: "居家服務" },
      { value: "日間照顧", label: "日間照顧" },
      { value: "喘息服務", label: "喘息服務" },
      { value: "住宿", label: "住宿型機構" },
      { value: "社區", label: "社區照顧據點" },
      { value: "家庭托顧", label: "家庭托顧" },
      { value: "專業照護", label: "專業照護" },
      { value: "交通接送", label: "交通接送" },
      { value: "輔具", label: "輔具與無障礙改善" },
      { value: "巷弄長照站", label: "巷弄長照站" },
    ],
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
    categories: [
      { value: "居家服務", label: "居家服務" },
      { value: "日間照顧服務", label: "日間照顧服務" },
      { value: "家庭托顧服務", label: "家庭托顧服務" },
      { value: "喘息服務", label: "喘息服務" },
      { value: "專業照護服務", label: "專業照護服務" },
      { value: "居家失能個案家庭醫師照護服務", label: "居家失能個案家庭醫師照護服務" },
      { value: "社區式交通接送服務", label: "社區式交通接送服務" },
      { value: "交通接送服務", label: "交通接送服務" },
      { value: "輔具及居家無障礙環境改善服務", label: "輔具及居家無障礙環境改善服務" },
      { value: "營養餐飲服務", label: "營養餐飲服務" },
      { value: "個案管理服務", label: "個案管理服務" },
      { value: "巷弄長照站", label: "巷弄長照站" },
      { value: "小規模多機能服務", label: "小規模多機能服務" },
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
} satisfies Record<string, FacilitySearchConfig>;
