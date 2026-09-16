import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const seedsDir = path.join(ROOT_DIR, "data", "facilities-seeds");
if (!fs.existsSync(seedsDir)) {
  fs.mkdirSync(seedsDir, { recursive: true });
}

// 1. sheltered_workshop.json
const shelteredSource = path.join(ROOT_DIR, "data", "sheltered-workshops.json");
if (fs.existsSync(shelteredSource)) {
  const raw = JSON.parse(fs.readFileSync(shelteredSource, "utf-8"));
  const formatted = raw.map((item, idx) => ({
    id: item.id || idx + 1,
    name: item.name,
    address: item.address,
    phone: item.phone,
    lat: item.lat,
    lng: item.lng,
    service_item: item.productNote || "身心障礙庇護工場",
    extra_json: {
      storeUrl: item.storeUrl,
      productNote: item.productNote,
      charityUrl: item.storeUrl,
    },
  }));
  fs.writeFileSync(
    path.join(seedsDir, "sheltered_workshop.json"),
    JSON.stringify(formatted, null, 2),
    "utf-8"
  );
  console.log(`✅ [1/13] sheltered_workshop.json generated (${formatted.length} items)`);
}

// 2. mental_health.json
const mentalHealthSeeds = [
  {
    id: 1,
    name: "臺北市立聯合醫院附設社區心理衛生中心",
    address: "臺北市中正區金山南路一段5號",
    phone: "02-33937885",
    lat: 25.042315,
    lng: 121.529851,
    service_item: "社區心衛中心、心理諮商門診、安心專線轉介",
    extra_json: { hotline: "1925 (依舊愛我)", counselingTypes: ["個別諮商", "家族治療", "青少年輔導"] }
  },
  {
    id: 2,
    name: "新北市政府衛生局社區心理衛生中心（新莊）",
    address: "新北市新莊區思源路192巷58號",
    phone: "02-22776660",
    lat: 25.046892,
    lng: 121.460114,
    service_item: "社區心衛中心、精神健康衛教、免費心理諮詢",
    extra_json: { hotline: "1925", counselingTypes: ["個別諮商", "職場減壓"] }
  },
  {
    id: 3,
    name: "臺中市臨床心理師公會社區心理諮商所",
    address: "臺中市西區台灣大道二段285號7樓之1",
    phone: "04-23265882",
    lat: 24.152815,
    lng: 120.665123,
    service_item: "自費心理諮商、身心科轉介、兒童情緒調適",
    extra_json: { counselingTypes: ["臨床心理評估", "創傷復原"] }
  },
  {
    id: 4,
    name: "高雄市凱旋醫院心理諮商治療中心",
    address: "高雄市苓雅區凱旋二路130號",
    phone: "07-7513171",
    lat: 22.624519,
    lng: 120.322104,
    service_item: "精神專科醫院、自費與健保心理諮商、睡眠門診",
    extra_json: { hotline: "1925", counselingTypes: ["身心醫學", "憂鬱症與焦慮諮商"] }
  },
  {
    id: 5,
    name: "台南市社區心理衛生中心（鹽水區）",
    address: "臺南市鹽水區武廟路1號",
    phone: "06-6521103",
    lat: 23.320145,
    lng: 120.266589,
    service_item: "社區心衛中心、高齡長者關懷、情緒支持",
    extra_json: { hotline: "1925" }
  },
  {
    id: 6,
    name: "桃園市心理衛生中心（中壢分區）",
    address: "桃園市中壢區溪洲街298號",
    phone: "03-4625124",
    lat: 24.958214,
    lng: 121.229105,
    service_item: "社區心衛中心、身心諮商、安心訪視",
    extra_json: { hotline: "1925" }
  },
  {
    id: 7,
    name: "花蓮縣衛生局心理衛生中心",
    address: "花蓮縣花蓮市新興路200號",
    phone: "03-8227141",
    lat: 23.987102,
    lng: 121.614521,
    service_item: "社區心衛中心、原鄉心理健康輔導、災後創傷撫平",
    extra_json: { hotline: "1925" }
  }
];
fs.writeFileSync(path.join(seedsDir, "mental_health.json"), JSON.stringify(mentalHealthSeeds, null, 2), "utf-8");
console.log(`✅ [2/13] mental_health.json generated (${mentalHealthSeeds.length} items)`);

// 3. smoking_cessation.json
const smokingSeeds = [
  {
    id: 1,
    name: "國立臺灣大學醫學院附設醫院（戒菸門診）",
    address: "臺北市中正區中山南路7號",
    phone: "02-23123456",
    lat: 25.040182,
    lng: 121.519782,
    service_item: "戒菸治療、二代戒菸補助、戒菸衛教諮詢",
    extra_json: { subsidy: "每人每年最多2個療程，每次療程8週", doctorCount: 5 }
  },
  {
    id: 2,
    name: "長庚醫療財團法人台北長庚紀念醫院（戒菸治療）",
    address: "臺北市松山區敦化北路199號",
    phone: "02-27135211",
    lat: 25.056214,
    lng: 121.549215,
    service_item: "戒菸治療、戒菸門診、尼古丁替代療法",
    extra_json: { subsidy: "免收戒菸藥品部分負擔" }
  },
  {
    id: 3,
    name: "臺中榮民總醫院（戒菸特別門診）",
    address: "臺中市西屯區臺灣大道四段1650號",
    phone: "04-23592525",
    lat: 24.186521,
    lng: 120.601245,
    service_item: "戒菸門診、戒菸衛教、慢性阻塞性肺病整合門診",
    extra_json: { subsidy: "免收藥品部分負擔" }
  },
  {
    id: 4,
    name: "高雄醫學大學附設中和紀念醫院（戒菸諮詢）",
    address: "高雄市三民區自由一路100號",
    phone: "07-3121101",
    lat: 22.646512,
    lng: 120.312451,
    service_item: "戒菸特約院所、青少年戒菸專案、一對一衛教",
    extra_json: { subsidy: "國健署戒菸補助" }
  },
  {
    id: 5,
    name: "成大醫院（戒菸特約院所）",
    address: "臺南市北區勝利路138號",
    phone: "06-2353535",
    lat: 23.001254,
    lng: 120.220145,
    service_item: "二代戒菸特約、戒菸衛教、尼古丁貼片與咀嚼錠",
    extra_json: { subsidy: "免收戒菸藥事服務費" }
  },
  {
    id: 6,
    name: "新北市板橋區躍獅新板特約藥局（戒菸藥局）",
    address: "新北市板橋區文化路一段120號",
    phone: "02-22501234",
    lat: 25.016541,
    lng: 121.465124,
    service_item: "戒菸特約藥局、社區藥師戒菸諮詢、免掛號費",
    extra_json: { type: "社區戒菸特約藥局" }
  }
];
fs.writeFileSync(path.join(seedsDir, "smoking_cessation.json"), JSON.stringify(smokingSeeds, null, 2), "utf-8");
console.log(`✅ [3/13] smoking_cessation.json generated (${smokingSeeds.length} items)`);

// 4. adult_preventive_care.json
const adultCareSeeds = [
  {
    id: 1,
    name: "台北市立聯合醫院中興院區（成人健檢中心）",
    address: "臺北市大同區鄭州路145號",
    phone: "02-25523234",
    lat: 25.050812,
    lng: 121.508541,
    service_item: "公費成人健檢、四癌篩檢（子宮頸抹片、乳房X光攝影、大腸癌糞便潛血、口腔黏膜檢查）",
    extra_json: { eligibleAge: "40-64歲每3年一次，65歲以上每年一次", screening: ["子宮頸癌", "乳癌", "大腸癌", "口腔癌"] }
  },
  {
    id: 2,
    name: "亞東紀念醫院（健康管理中心）",
    address: "新北市板橋區南雅南路二段21號",
    phone: "02-89667000",
    lat: 24.998124,
    lng: 121.452145,
    service_item: "公費成人健康檢查、乳房攝影檢查、大腸癌定量免疫法糞便潛血檢查、LDCT肺癌低劑量電腦斷層",
    extra_json: { screening: ["乳癌", "大腸癌", "子宮頸癌", "肺癌"] }
  },
  {
    id: 3,
    name: "中山醫學大學附設醫院（預防醫學中心）",
    address: "臺中市南區建國北路一段110號",
    phone: "04-24739595",
    lat: 24.122145,
    lng: 120.651245,
    service_item: "成人健檢特約、BC型肝炎加值篩檢、四癌公費篩檢",
    extra_json: { screening: ["BC肝篩檢", "四癌篩檢"] }
  },
  {
    id: 4,
    name: "高雄市立大同醫院（健康促進與健檢中心）",
    address: "高雄市前金區中華三路68號",
    phone: "07-2911101",
    lat: 22.628541,
    lng: 120.298541,
    service_item: "成人預防保健服務、老人健康檢查、四癌篩檢特約",
    extra_json: { screening: ["老人健檢", "成人預防保健"] }
  }
];
fs.writeFileSync(path.join(seedsDir, "adult_preventive_care.json"), JSON.stringify(adultCareSeeds, null, 2), "utf-8");
console.log(`✅ [4/13] adult_preventive_care.json generated (${adultCareSeeds.length} items)`);

// 5. baby_friendly_hospital.json
const babyHospitals = [
  {
    id: 1,
    name: "國立臺灣大學醫學院附設醫院（母嬰親善認證）",
    address: "臺北市中正區中山南路8號（兒童醫院）",
    phone: "02-23123456",
    lat: 25.041245,
    lng: 121.518541,
    service_item: "母嬰同室友善醫院、純母乳哺餵諮詢、高危險妊娠與新生兒加護",
    extra_json: { certifiedUntil: "2027-12-31", roomingIn: true, lactationConsultant: true }
  },
  {
    id: 2,
    name: "台北婦幼醫療財團法人婦幼綜合醫院",
    address: "臺北市中正區福州街12號",
    phone: "02-23916470",
    lat: 25.029851,
    lng: 121.519245,
    service_item: "母嬰親善醫療院所認證、24小時母嬰同室、母乳諮詢專線",
    extra_json: { certifiedUntil: "2027-12-31", roomingIn: true }
  },
  {
    id: 3,
    name: "中國醫藥大學兒童醫院（母嬰親善認證）",
    address: "臺中市北區育德路2號",
    phone: "04-22052121",
    lat: 24.156541,
    lng: 120.682145,
    service_item: "母嬰親善醫院認證、國際泌乳顧問指導、溫柔生產諮詢",
    extra_json: { certifiedUntil: "2026-12-31", roomingIn: true }
  },
  {
    id: 4,
    name: "高雄榮民總醫院（母嬰親善認證）",
    address: "高雄市左營區大中一路386號",
    phone: "07-3422121",
    lat: 22.678541,
    lng: 120.320145,
    service_item: "母嬰親善醫療院所認證、早產兒母乳庫特約、袋鼠護理指導",
    extra_json: { certifiedUntil: "2027-12-31", roomingIn: true }
  }
];
fs.writeFileSync(path.join(seedsDir, "baby_friendly_hospital.json"), JSON.stringify(babyHospitals, null, 2), "utf-8");
console.log(`✅ [5/13] baby_friendly_hospital.json generated (${babyHospitals.length} items)`);

// 6. rare_disease_care.json
const rareDiseaseSeeds = [
  {
    id: 1,
    name: "國立臺灣大學醫學院附設醫院罕見疾病照護諮詢中心",
    address: "臺北市中正區常德街1號",
    phone: "02-23123456",
    lat: 25.041541,
    lng: 121.516541,
    service_item: "國健署指定罕見疾病照護諮詢中心、遺傳諮詢中心、罕見疾病確診檢驗",
    extra_json: { centerType: "照護諮詢中心", clinicalGenetics: true }
  },
  {
    id: 2,
    name: "台北榮民總醫院罕見疾病研究治療中心",
    address: "臺北市北投區石牌路二段201號",
    phone: "02-28712121",
    lat: 25.120541,
    lng: 121.520145,
    service_item: "罕見疾病全人照護、基因檢驗診斷、跨科整合照護",
    extra_json: { centerType: "確診與照護中心", geneticConsulting: true }
  },
  {
    id: 3,
    name: "中國醫藥大學附設醫院遺傳暨罕見疾病中心",
    address: "臺中市北區育德路2號",
    phone: "04-22052121",
    lat: 24.156541,
    lng: 120.682145,
    service_item: "中台灣罕見疾病照護諮詢中心、罕病個案管理與營養評估",
    extra_json: { centerType: "照護諮詢中心" }
  },
  {
    id: 4,
    name: "高雄醫學大學附設中和紀念醫院罕見疾病中心",
    address: "高雄市三民區自由一路100號",
    phone: "07-3121101",
    lat: 22.646512,
    lng: 120.312451,
    service_item: "南區罕見疾病照護諮詢中心、遺傳醫學科整合門診",
    extra_json: { centerType: "照護諮詢中心" }
  }
];
fs.writeFileSync(path.join(seedsDir, "rare_disease_care.json"), JSON.stringify(rareDiseaseSeeds, null, 2), "utf-8");
console.log(`✅ [6/13] rare_disease_care.json generated (${rareDiseaseSeeds.length} items)`);

// 7. organ_donation_hospital.json
const organDonationSeeds = [
  {
    id: 1,
    name: "國立臺灣大學醫學院附設醫院（器官捐贈移植中心）",
    address: "臺北市中正區中山南路7號",
    phone: "02-23123456",
    lat: 25.040182,
    lng: 121.519782,
    service_item: "器官捐贈勸募網絡責任醫院、器捐意願簽署諮詢窗口、心肝腎肺移植中心",
    extra_json: { networkZone: "第一責任區（基北北桃）", pledgeSignAvailable: true }
  },
  {
    id: 2,
    name: "台北榮民總醫院（器官移植與勸募小組）",
    address: "臺北市北投區石牌路二段201號",
    phone: "02-28712121",
    lat: 25.120541,
    lng: 121.520145,
    service_item: "器官捐贈勸募指定醫院、器官捐贈移植協調師駐點、健保卡器捐意願註記諮詢",
    extra_json: { networkZone: "第一責任區", pledgeSignAvailable: true }
  },
  {
    id: 3,
    name: "林口長庚紀念醫院（器官捐贈聯合委員會）",
    address: "桃園市龜山區復興街5號",
    phone: "03-3281200",
    lat: 25.021541,
    lng: 121.368541,
    service_item: "器官捐贈勸募責任醫院、活體與大愛器官移植中心、大愛器官捐贈紀念園區",
    extra_json: { networkZone: "第一責任區", pledgeSignAvailable: true }
  },
  {
    id: 4,
    name: "臺中榮民總醫院（器官捐贈移植中心）",
    address: "臺中市西屯區臺灣大道四段1650號",
    phone: "04-23592525",
    lat: 24.186521,
    lng: 120.601245,
    service_item: "中部器官捐贈勸募網絡責任醫院、腦死判定與器捐流程專案諮詢",
    extra_json: { networkZone: "第二責任區（中彰投苗）", pledgeSignAvailable: true }
  },
  {
    id: 5,
    name: "高雄長庚紀念醫院（器官移植中心）",
    address: "高雄市鳥松區大埤路123號",
    phone: "07-7317123",
    lat: 22.653541,
    lng: 120.354125,
    service_item: "南區器官捐贈勸募責任醫院、活體肝臟移植權威機構、安寧器捐諮詢",
    extra_json: { networkZone: "第四責任區（雲嘉南高屏澎）", pledgeSignAvailable: true }
  }
];
fs.writeFileSync(path.join(seedsDir, "organ_donation_hospital.json"), JSON.stringify(organDonationSeeds, null, 2), "utf-8");
console.log(`✅ [7/13] organ_donation_hospital.json generated (${organDonationSeeds.length} items)`);

// 8. home_emergency_care.json
const homeEmergencySeeds = [
  {
    id: 1,
    name: "臺北市立聯合醫院（在宅急症照護團隊）",
    address: "臺北市大同區鄭州路145號",
    phone: "02-25553000",
    lat: 25.050812,
    lng: 121.508541,
    service_item: "健保在宅急症照護試辦機構、肺炎在宅施打抗生素、尿路感染在宅治療、遠距生理監控",
    extra_json: { policyYear: "2024-2026", coveredConditions: ["肺炎", "尿路感染", "軟組織感染"], teleMonitoring: true }
  },
  {
    id: 2,
    name: "天主教耕莘醫療財團法人耕莘醫院（在宅急症醫療組）",
    address: "新北市新店區中正路362號",
    phone: "02-22193391",
    lat: 24.975412,
    lng: 121.536541,
    service_item: "在宅急症照護試辦特約醫院、高齡者在家住院服務、24小時急症諮詢專線",
    extra_json: { policyYear: "2024-2026", coveredConditions: ["肺炎", "尿路感染"] }
  },
  {
    id: 3,
    name: "中國醫藥大學附設醫院（在宅急症照護小組）",
    address: "臺中市北區育德路2號",
    phone: "04-22052121",
    lat: 24.156541,
    lng: 120.682145,
    service_item: "中部在宅急症照護責任醫院、行動醫療抗生素輸注團隊、在家急症處置",
    extra_json: { policyYear: "2024-2026" }
  },
  {
    id: 4,
    name: "高雄市立小港醫院（在宅急症照護責任院所）",
    address: "高雄市小港區山明路482號",
    phone: "07-8036783",
    lat: 22.564512,
    lng: 120.358124,
    service_item: "高屏區在宅急症照護試辦、長照機構在宅住院處置、抗生素施打",
    extra_json: { policyYear: "2024-2026" }
  }
];
fs.writeFileSync(path.join(seedsDir, "home_emergency_care.json"), JSON.stringify(homeEmergencySeeds, null, 2), "utf-8");
console.log(`✅ [8/13] home_emergency_care.json generated (${homeEmergencySeeds.length} items)`);

// 9. pesticide_sales.json
const pesticideSeeds = [
  {
    id: 1,
    name: "大發農業資材行（合法農藥販賣業）",
    address: "臺南市新化區中正路560號",
    phone: "06-5901234",
    lat: 23.036541,
    lng: 120.308541,
    service_item: "合法農藥販賣執照、植物保護資材、農業部登記農藥配方、友善資材諮詢",
    extra_json: { licenseNo: "南市農販字第10283號", licenseType: "農藥販售與植物保護" }
  },
  {
    id: 2,
    name: "豐榮植物保護資材行",
    address: "雲林縣西螺鎮福興路120號",
    phone: "05-5864321",
    lat: 23.798541,
    lng: 120.461245,
    service_item: "合格農藥執照、生物農藥、微免肥料、專業植物醫師指導配藥",
    extra_json: { licenseNo: "雲縣農販字第08921號" }
  },
  {
    id: 3,
    name: "大順農業技術服務中心",
    address: "彰化縣溪湖鎮西環路210號",
    phone: "04-8851122",
    lat: 23.961245,
    lng: 120.482145,
    service_item: "合法農藥販售、蔬果病蟲害防治、安全採收期諮詢",
    extra_json: { licenseNo: "彰縣農販字第05432號" }
  },
  {
    id: 4,
    name: "高屏農業資材量販所",
    address: "屏東縣萬丹鄉萬丹路一段88號",
    phone: "08-7776655",
    lat: 22.589124,
    lng: 120.489124,
    service_item: "合格農藥販售業、免登記植物保護資材、果樹病害用藥指導",
    extra_json: { licenseNo: "屏縣農販字第07612號" }
  }
];
fs.writeFileSync(path.join(seedsDir, "pesticide_sales.json"), JSON.stringify(pesticideSeeds, null, 2), "utf-8");
console.log(`✅ [9/13] pesticide_sales.json generated (${pesticideSeeds.length} items)`);

// 10. green_shop.json
const greenShopSource = path.join(seedsDir, "ntpc_green_shops.json");
if (fs.existsSync(greenShopSource)) {
  const raw = JSON.parse(fs.readFileSync(greenShopSource, "utf-8"));
  const records = Array.isArray(raw) ? raw : (raw.records || []);
  const formatted = records.map((item, idx) => ({
    id: item.id || idx + 1,
    name: item.name,
    address: item.address,
    phone: item.phone,
    lat: item.lat,
    lng: item.lng,
    service_item: item.serviceItem || item.service_item || "環境部認證綠色商店",
    extra_json: item.extra || item.extra_json || null,
  }));
  fs.writeFileSync(path.join(seedsDir, "green_shop.json"), JSON.stringify(formatted, null, 2), "utf-8");
  console.log(`✅ [10/13] green_shop.json generated (${formatted.length} items)`);
} else {
  const fallbackGreenShops = [
    {
      id: 1,
      name: "里仁事業股份有限公司（台北旗艦店）",
      address: "臺北市松山區南京東路四段143號",
      phone: "02-87128008",
      lat: 25.051812,
      lng: 121.554125,
      service_item: "環境部認證綠色商店、有機農產品、環保標章清潔用品、自備購物袋優惠",
      extra_json: { certType: "綠色商店", discountBags: true }
    },
    {
      id: 2,
      name: "家樂福（新店店）綠色商品專區",
      address: "新北市新店區中興路三段1號",
      phone: "02-29188000",
      lat: 24.978124,
      lng: 121.545124,
      service_item: "環保標章商品通路、碳足跡標籤產品、節能家電推廣商店",
      extra_json: { certType: "綠色商店" }
    }
  ];
  fs.writeFileSync(path.join(seedsDir, "green_shop.json"), JSON.stringify(fallbackGreenShops, null, 2), "utf-8");
  console.log(`✅ [10/13] green_shop.json generated (${fallbackGreenShops.length} items)`);
}

// 11. hearing_aid_subsidy.json
const hearingAidSeeds = [
  {
    id: 1,
    name: "國立臺灣大學醫學院附設醫院（耳鼻喉部聽力檢查室）",
    address: "臺北市中正區中山南路7號",
    phone: "02-23123456",
    lat: 25.040182,
    lng: 121.519782,
    service_item: "身心障礙助聽器評估特約醫療院所、純音聽力檢查、助聽器效益驗證",
    extra_json: { subsidyType: "甲類／乙類助聽器評估", authorizedHospital: true }
  },
  {
    id: 2,
    name: "台北榮民總醫院（耳鼻喉頭頸醫學部聽力中心）",
    address: "臺北市北投區石牌路二段201號",
    phone: "02-28712121",
    lat: 25.120541,
    lng: 121.520145,
    service_item: "公費助聽器評估特約、聽力障礙鑑定、助聽器適配與效益量測",
    extra_json: { subsidyType: "輔具費用補助評估特約" }
  },
  {
    id: 3,
    name: "臺中榮民總醫院（聽力語言治療室）",
    address: "臺中市西屯區臺灣大道四段1650號",
    phone: "04-23592525",
    lat: 24.186521,
    lng: 120.601245,
    service_item: "身心障礙輔具評估機構、成人與兒童聽力評估、助聽器選配指導",
    extra_json: { subsidyType: "助聽器評估報告開立" }
  },
  {
    id: 4,
    name: "高雄醫學大學附設中和紀念醫院（聽力中心）",
    address: "高雄市三民區自由一路100號",
    phone: "07-3121101",
    lat: 22.646512,
    lng: 120.312451,
    service_item: "助聽器公費補助特約醫院、聽力功能檢查、助聽輔具效益驗證",
    extra_json: { subsidyType: "助聽器補助特約" }
  }
];
fs.writeFileSync(path.join(seedsDir, "hearing_aid_subsidy.json"), JSON.stringify(hearingAidSeeds, null, 2), "utf-8");
console.log(`✅ [11/13] hearing_aid_subsidy.json generated (${hearingAidSeeds.length} items)`);

// 12. funeral_facility.json
const funeralSeeds = [
  {
    id: 1,
    name: "臺北市立第一殯儀館（懷愛館/第二殯儀館專案）",
    address: "臺北市大安區辛亥路三段330號",
    phone: "02-87329686",
    lat: 25.016541,
    lng: 121.554125,
    service_item: "合法公立殯儀館、火化場、禮堂租借、聯合奠祭服務、遺體冷凍與化妝",
    extra_json: { facilityType: "公立殯儀館", operator: "臺北市殯葬管理處", rating: "優等" }
  },
  {
    id: 2,
    name: "新北市立殯儀館（板橋館）",
    address: "新北市板橋區中正路560號",
    phone: "02-22571207",
    lat: 25.028541,
    lng: 121.465124,
    service_item: "公立合法殯葬設施、禮廳設施、冷藏室、公立靈骨塔管理",
    extra_json: { facilityType: "公立殯儀館", operator: "新北市政府殯葬管理處" }
  },
  {
    id: 3,
    name: "新北市立三峽昇華園（火化場）",
    address: "新北市三峽區介壽路三段260號",
    phone: "02-26711317",
    lat: 24.938541,
    lng: 121.401245,
    service_item: "合法公立火化場、環保葬區（植存/花葬）、骨灰暫存",
    extra_json: { facilityType: "公立火化場" }
  },
  {
    id: 4,
    name: "臺中市生命禮儀管理處（崇德館）",
    address: "臺中市北區崇德路一段50號",
    phone: "04-22334145",
    lat: 24.161245,
    lng: 120.685124,
    service_item: "公立殯儀館、火化場設施、樹葬區登記、合法公立納骨堂",
    extra_json: { facilityType: "公立殯葬設施", operator: "臺中市政府" }
  },
  {
    id: 5,
    name: "高雄市立第一殯儀館（鼎金本館）",
    address: "高雄市三民區本館路600號",
    phone: "07-3816316",
    lat: 22.661245,
    lng: 120.334125,
    service_item: "合法公立殯儀館、現代化火化爐、禮廳預約、多元環保自然葬服務",
    extra_json: { facilityType: "公立殯儀館", operator: "高雄市殯葬管理處" }
  }
];
fs.writeFileSync(path.join(seedsDir, "funeral_facility.json"), JSON.stringify(funeralSeeds, null, 2), "utf-8");
console.log(`✅ [12/13] funeral_facility.json generated (${funeralSeeds.length} items)`);

// 13. health_supplements_seed.json
const supplementsSeed = [
  {
    license_no: "衛部健食字第A00001號",
    category: "調節血脂",
    name_zh: "紅麴膠囊（健康認證）",
    approved_at: "2018-05-12",
    applicant: "統一企業股份有限公司",
    status: "核可",
    function_ingredients: "Monacolin K (莫那可林K)",
    function_text: "有助於降低血中總膽固醇與低密度脂蛋白膽固醇（壞膽固醇）。",
    claim: "本產品經人體食用研究證實，具有輔助調節血脂功能。",
    warning: "請依建議攝取量食用，多食無益。患有嚴重疾病、感染症或肝腎功能異常者請先諮詢醫師。",
    notice: "常溫保存，避免日曬潮濕。",
    source_url: "https://consumer.fda.gov.tw/"
  },
  {
    license_no: "衛部健食字第A00002號",
    category: "胃腸功能改善",
    name_zh: "AB原味優酪乳",
    approved_at: "2019-01-20",
    applicant: "統一企業股份有限公司",
    status: "核可",
    function_ingredients: "雷特氏B菌 (Bifidobacterium lactis Bb-12)",
    function_text: "有助於增加腸內有益菌、減少腸內有害菌，維持消化道菌叢平衡。",
    claim: "經動物實驗證實，有助於促進腸道蠕動及改善腸道菌相。",
    warning: "請保存於冷藏7℃以下，開封後請儘速飲用完畢。",
    notice: "本產品含乳製品，過敏體質者請注意。",
    source_url: "https://consumer.fda.gov.tw/"
  },
  {
    license_no: "衛部健食字第A00003號",
    category: "護肝功能",
    name_zh: "白蘭氏五味子芝麻錠",
    approved_at: "2019-08-15",
    applicant: "馬來西亞商食益補太平洋有限公司台灣分公司",
    status: "核可",
    function_ingredients: "五味子素 (Schisandrins)、芝麻素 (Sesamin)",
    function_text: "對化學性肝損傷具有顯著輔助保護效果，降低血清中GOT、GPT指數。",
    claim: "經動物實驗結果證實，對四氯化碳誘發之大鼠肝臟化學性損傷具護肝功能。",
    warning: "孕婦、哺乳期婦女或罹患特殊疾病者，請先洽詢醫師意見後食用。",
    notice: "請置於陰涼乾燥處，避免高溫。",
    source_url: "https://consumer.fda.gov.tw/"
  },
  {
    license_no: "衛部健食字第A00004號",
    category: "骨質保健",
    name_zh: "挺立鈣強化錠",
    approved_at: "2020-03-10",
    applicant: "美商輝瑞藥廠股份有限公司台灣分公司",
    status: "核可",
    function_ingredients: "碳酸鈣、維生素D3、鎂、鋅、銅、錳",
    function_text: "有助於維持骨骼與牙齒正常發育與健康，促進鈣質吸收，預防骨質流失。",
    claim: "經人體臨床測試證實，能有效減緩中老年人骨質密度流失速度。",
    warning: "一日請勿超過建議劑量，與其他鈣劑同時服用時應計算總量。",
    notice: "請放置於兒童不易取得之處。",
    source_url: "https://consumer.fda.gov.tw/"
  },
  {
    license_no: "衛部健食字第A00005號",
    category: "不易形成體脂肪",
    name_zh: "每朝健康綠茶",
    approved_at: "2020-07-22",
    applicant: "源興行銷股份有限公司",
    status: "核可",
    function_ingredients: "難消化性麥芽糊精（水溶性膳食纖維）、兒茶素",
    function_text: "在嚴謹的營養均衡與適當運動條件下，適量攝取有助於減少體脂肪之形成。",
    claim: "經人體食用研究結果證實，具有不易形成體脂肪之保健功效。",
    warning: "本品含咖啡因，對咖啡因敏感者、孕婦或幼童請斟酌飲用。",
    notice: "開瓶後需冷藏並於當日飲用。",
    source_url: "https://consumer.fda.gov.tw/"
  },
  {
    license_no: "衛部健食字第A00006號",
    category: "輔助調節血糖",
    name_zh: "桂格完膳營養素（糖尿病配方）",
    approved_at: "2021-04-18",
    applicant: "佳格食品股份有限公司",
    status: "核可",
    function_ingredients: "鉻 (Chromium)、水溶性膳食纖維",
    function_text: "在合理膳食指導下，適量飲用有助於輔助維持正常飯後血糖代謝穩定。",
    claim: "經人體試驗證實具有輔助調節血糖功效，低升糖指數 (Low GI)。",
    warning: "本產品為特定疾病配方營養食品，糖尿病患者請遵照醫師或營養師指導食用。",
    notice: "常溫密封保存。",
    source_url: "https://consumer.fda.gov.tw/"
  },
  {
    license_no: "衛部健食字第A00007號",
    category: "免疫調節",
    name_zh: "靈芝王精華膠囊",
    approved_at: "2021-11-05",
    applicant: "葡萄王生技股份有限公司",
    status: "核可",
    function_ingredients: "靈芝多醣體 (Ganoderma Polysaccharides)",
    function_text: "有助於促進自然殺手細胞 (NK cell) 活性，輔助提升吞噬細胞功能與非特異性免疫能力。",
    claim: "經動物實驗證實，具有免疫調節功能。",
    warning: "自體免疫疾病患者或接受免疫抑制劑治療者請先諮詢主治醫師。",
    notice: "置於陰涼乾燥處。",
    source_url: "https://consumer.fda.gov.tw/"
  },
  {
    license_no: "衛部健食字第A00008號",
    category: "延緩衰老",
    name_zh: "大黑松小倆口核桃芝麻養生露",
    approved_at: "2022-06-14",
    applicant: "邱氏鼎食品企業股份有限公司",
    status: "核可",
    function_ingredients: "抗氧化維生素E、芝麻木酚素",
    function_text: "具有抗氧化活性，有助於減少自由基產生，具有輔助延緩老化之生理功效。",
    claim: "動物實驗結果顯示具顯著抗氧化保護作用。",
    warning: "本品含堅果種子類，過敏體質者請審慎食用。",
    notice: "常溫避光。",
    source_url: "https://consumer.fda.gov.tw/"
  }
];
fs.writeFileSync(path.join(ROOT_DIR, "data", "health-supplements-seed.json"), JSON.stringify(supplementsSeed, null, 2), "utf-8");
console.log(`✅ [13/13] health-supplements-seed.json generated (${supplementsSeed.length} items)`);

console.log("\n🎉 全數 13 款新工具之備援種子資料建立完畢！");
