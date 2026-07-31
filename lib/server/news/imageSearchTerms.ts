import { Segment, useDefault } from "segmentit";

const segmentit = useDefault(new Segment());

/**
 * Extensive mapping of Traditional Chinese health, food, education, public safety,
 * weather, and lifestyle keywords to English Pixabay search terms.
 * Checked top-to-bottom, first matching rule wins.
 */
const KEYWORD_TERMS: [RegExp, string][] = [
  // ─── 1. 食安、飲食、食材、美食餐飲 ─────────────────────────────────────────
  [/美食展|美食節|美食|小吃|佳餚|名店|名廚|美饌|餐飲|傳統美食|在地美食/, "delicious food"],
  [/鍋烤節|火鍋|燒肉|烤肉|涮涮鍋|麻辣鍋/, "hot pot"],
  [/苦茶油|沙拉油|橄欖油|食用油|沙拉油|中聯油脂|植物油|油品|致癌油|苯駢芘/, "cooking oil"],
  [/米粉|炊粉|麵條|義大利麵|烏龍麵|拉麵|肉圓|草仔粿|飯糰/, "noodles"],
  [/營養午餐|學校午餐|午餐|便當/, "school lunch"],
  [/果汁|包裝果汁|飲料|汽水|手搖飲|冰品/, "juice"],
  [/茶|苦茶|綠茶|紅茶|高山茶|烏龍茶/, "tea"],
  [/咖啡|拿鐵|美式咖啡/, "coffee"],
  [/牛奶|鮮奶|乳品|優格|奶粉/, "milk"],
  [/蝦仁|海鮮|魚|鮮魚|文蛤|牡蠣|海鮮粥/, "seafood"],
  [/豬肉|非洲豬瘟|香腸|培根/, "pork"],
  [/牛肉|牛排/, "beef"],
  [/雞肉|家禽|土雞/, "chicken"],
  [/蔬果|蔬菜|水果|高麗菜|竹筍|麻竹筍/, "vegetables"],
  [/草莓|蘋果|香蕉|葡萄|芒果/, "fruit"],
  [/甜點|蛋糕|烘焙|餅乾|糕餅/, "bakery"],
  [/廚餘|垃圾|惡臭|廚餘場/, "food waste"],
  [/食安|食品安全|抽驗|不合格|過期|毒素|防腐劑|甲醛/, "food safety"],

  // ─── 2. 學校、教育、文教、學術 ──────────────────────────────────────────────
  [/校長|交接|學校|國小|國中|高中|教職|教育局|教育部/, "school"],
  [/學生|學童|大考|命題|試題|大學|澎科大|中山醫/, "students"],
  [/繪畫|比賽|得獎|作畫|作品/, "painting"],

  // ─── 3. 醫療、救護、警消、醫療院所 ─────────────────────────────────────────
  [/救護車|急救|到院前/, "ambulance"],
  [/總院長|院長|主治醫師|名醫|醫師|醫生|醫療團隊/, "doctor"],
  [/護理師|護理長|護士|護理/, "nurse"],
  [/醫院|門診|急診|診所|中山附醫/, "hospital"],
  [/藥局|藥師|調劑/, "pharmacy"],
  [/健檢|體檢|抽血|篩檢|健檢中心/, "medical checkup"],
  [/疫苗|流感疫苗|新冠疫苗|打疫苗/, "vaccine"],
  [/新冠|確診|疫情|傳染病|登革熱|腸病毒|病毒|感染/, "virus"],
  [/流感|感冒|發燒|咳嗽/, "flu"],
  [/癌症|腫瘤|化療|標靶|癌/, "cancer"],
  [/心臟|心血管|心肌梗塞|心律不整/, "heart"],
  [/糖尿病|血糖/, "diabetes"],
  [/血壓|高血壓|低血壓/, "blood pressure"],
  [/中風|腦中風/, "stroke"],
  [/牙醫|牙齒|植牙|洗牙|口腔|蛀牙/, "dental"],
  [/眼睛|視力|近視|眼科|白內障|黃斑部/, "eye"],
  [/皮膚|皮膚科|濕疹|蕁麻疹|過敏/, "skin"],
  [/懷孕|孕婦|生產|待產|育兒|產婦|母乳|哺育/, "pregnancy"],
  [/嬰兒|新生兒|幼兒/, "baby"],
  [/兒童|小孩|少兒/, "child"],
  [/老人|長者|高齡|銀髮|老人健保/, "elderly"],
  [/長照|照護|看護|居服員|照顧/, "caregiver"],
  [/失智|阿茲海默|腦退化/, "dementia"],
  [/憂鬱|焦慮|心理|壓力|情緒|精神/, "mental health"],
  [/睡眠|失眠|睡覺|打呼/, "sleep"],
  [/減重|減肥|肥胖|瘦身|脂防/, "weight loss"],
  [/運動|健身|跑步|路跑|馬拉松|戰鬥陀螺/, "fitness"],
  [/瑜珈|瑜伽/, "yoga"],
  [/營養|飲食|保健食品|維他命/, "nutrition"],
  [/中醫|針灸|中藥|推拿/, "acupuncture"],
  [/藥品|用藥|服藥|藥物|西藥|處方箋/, "medicine"],
  [/手術|開刀|微創/, "surgery"],
  [/復健|物理治療|職能治療/, "physical therapy"],

  // ─── 4. 社福、公共事務、慈善、社區 ─────────────────────────────────────────
  [/捐贈|善行|公益|傳承|愛心|捐款/, "charity"],
  [/志工|義工|服務隊/, "volunteer"],
  [/健保|補助|津貼|社會局|重撥款/, "subsidy"],
  [/父親節|重陽節|母親節|節慶|紀念日/, "family"],
  [/展覽|博覽會|市集/, "exhibition"],

  // ─── 5. 動物、生態、自然、海洋 ─────────────────────────────────────────────
  [/亞洲象|象舍|大象|舊象舍/, "elephant"],
  [/紫斑蝶|蝴蝶|蝶道|昆蟲/, "butterfly"],
  [/白海豚|海豚|鯨豚/, "dolphin"],
  [/黑熊|山豬|野生動物|動物園|動物/, "animals"],
  [/海洋|國海院|海邊|海浪/, "ocean"],

  // ─── 6. 氣象、環境、天然災害、能源 ─────────────────────────────────────────
  [/颱風|白海豚颱風|低壓系統|風雨/, "storm"],
  [/雨彈|豪雨|大雨|豪雨特報|淹水|積水/, "rain"],
  [/雷雨|大雷雨|閃電/, "thunderstorm"],
  [/高溫|高溫資訊|熱浪|酷暑/, "heatwave"],
  [/地震|強震|震央/, "earthquake"],
  [/空氣品質|空污|霧霾|PM2.5/, "air pollution"],
  [/能源|虛擬電廠|節能|綠能|太陽能/, "solar energy"],
  [/公車|專車|交管|交通|工程|捷運/, "bus"],
];

/** Tier 2 Fallback keywords if Jieba terms return no image on Pixabay */
export const FALLBACK_TERMS = ["health", "life"] as const;

/**
 * Stage 1: Segment title using Segmentit (pure JS Jieba algorithm) and match against 100+ mapped English keywords.
 * Returns null if no matched term is found.
 */
export function deriveJiebaSearchTerm(title: string): string | null {
  if (!title) return null;
  const tokens = segmentit.doSegment(title);

  // Check each segmented token against the keyword map
  for (const token of tokens) {
    const word = token.w;
    if (word.length < 2 && !/[a-zA-Z0-9]/.test(word)) continue; // skip single Chinese characters
    for (const [pattern, englishTerm] of KEYWORD_TERMS) {
      if (pattern.test(word)) {
        return englishTerm;
      }
    }
  }

  // Fallback check on full title string if token segmentation didn't hit regex
  for (const [pattern, englishTerm] of KEYWORD_TERMS) {
    if (pattern.test(title)) {
      return englishTerm;
    }
  }

  return null;
}

/**
 * Stage 2: Fallback term (health vs life) based on article ID or index.
 */
export function deriveFallbackTerm(indexOrId: number): string {
  return FALLBACK_TERMS[Math.abs(indexOrId) % FALLBACK_TERMS.length];
}

/** Legacy wrapper compatibility */
export function deriveSearchTerm(title: string, fallbackIndex: number): string {
  return deriveJiebaSearchTerm(title) || deriveFallbackTerm(fallbackIndex);
}
