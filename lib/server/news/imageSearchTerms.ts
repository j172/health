import { Segment, useDefault } from "segmentit";

const segmentit = useDefault(new Segment());

/**
 * Maps Traditional Chinese health-news keywords (extracted after segmentation)
 * to English Pixabay search queries.
 */
const KEYWORD_TERMS: [RegExp, string][] = [
  [/疫苗/, "vaccine"],
  [/新冠|確診|covid/i, "covid"],
  [/流感|感冒/, "flu"],
  [/癌症|腫瘤|癌/, "cancer"],
  [/心臟|心血管/, "heart"],
  [/糖尿病/, "diabetes"],
  [/血壓/, "blood pressure"],
  [/中風/, "stroke"],
  [/牙醫|牙齒|口腔/, "dental"],
  [/眼睛|視力|近視|眼科/, "eye"],
  [/皮膚|皮膚科/, "skin"],
  [/懷孕|孕婦|生產|待產|育兒/, "pregnancy"],
  [/嬰兒|新生兒/, "baby"],
  [/兒童|小孩|幼兒/, "child"],
  [/老人|長者|高齡|銀髮/, "elderly"],
  [/長照|照護|看護/, "caregiver"],
  [/失智|阿茲海默/, "dementia"],
  [/憂鬱|焦慮|心理|壓力|情緒/, "mental health"],
  [/睡眠|失眠|睡覺/, "sleep"],
  [/減重|減肥|肥胖|瘦身/, "weight loss"],
  [/運動|健身|跑步|路跑/, "fitness"],
  [/瑜珈|瑜伽/, "yoga"],
  [/營養|飲食|膳食|蔬果/, "nutrition"],
  [/食安|食品安全|中毒/, "food safety"],
  [/中醫|針灸|中藥/, "acupuncture"],
  [/藥品|用藥|服藥|藥物|西藥/, "medicine"],
  [/疫情|傳染病|登革熱/, "pandemic"],
  [/手術|開刀/, "surgery"],
  [/復健/, "physical therapy"],
  [/護理|護士/, "nurse"],
  [/醫院|急診|門診|診所/, "hospital"],
  [/醫師|醫生/, "doctor"],
  [/藥局|藥師/, "pharmacy"],
  [/健檢|體檢|抽血/, "medical checkup"],
  [/空氣品質|空污|霧霾/, "air pollution"],
  [/地震/, "earthquake"],
  [/颱風|豪雨|淹水/, "storm"],
];

/** Tier 2 Fallback keywords if Jieba/Segmentit terms return no image on Pixabay */
export const FALLBACK_TERMS = ["health", "life"] as const;

/**
 * Stage 1: Segment title using Segmentit (pure JS Jieba algorithm) and match against mapped English keywords for Pixabay.
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
