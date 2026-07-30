/**
 * Maps common Traditional Chinese health-news keywords to an English term
 * that Pixabay's (English-tagged) search index actually returns results
 * for — a Chinese title searched verbatim against Pixabay's `q` param
 * returns few or no hits, since Pixabay's tagging is predominantly English.
 * Order matters: checked top-to-bottom, first match wins, so more specific
 * terms are listed before broader ones that could also match the same title
 * (e.g. "牙醫" before the generic "醫").
 */
const KEYWORD_TERMS: [RegExp, string][] = [
  [/疫苗/, "vaccine"],
  [/新冠|確診|covid/i, "covid"],
  [/流感|感冒/, "flu"],
  [/癌症|腫瘤/, "cancer"],
  [/心臟|心血管/, "heart"],
  [/糖尿病/, "diabetes"],
  [/血壓/, "blood pressure"],
  [/中風/, "stroke"],
  [/牙醫|牙齒|口腔/, "dental"],
  [/眼睛|視力|近視/, "eye"],
  [/皮膚/, "skin"],
  [/懷孕|孕婦|生產|待產/, "pregnancy"],
  [/嬰兒|新生兒/, "baby"],
  [/兒童|小孩|幼兒/, "child"],
  [/老人|長者|高齡/, "elderly"],
  [/長照|照護|看護/, "caregiver"],
  [/失智/, "dementia"],
  [/憂鬱|焦慮|心理|壓力/, "mental health"],
  [/睡眠|失眠/, "sleep"],
  [/減重|減肥|肥胖/, "weight loss"],
  [/運動|健身|跑步/, "fitness"],
  [/瑜珈|瑜伽/, "yoga"],
  [/營養|飲食/, "nutrition"],
  [/食安|食品安全/, "food safety"],
  [/中醫|針灸/, "acupuncture"],
  [/藥品|用藥|服藥|藥物/, "medicine"],
  [/疫情|傳染病/, "pandemic"],
  [/手術|開刀/, "surgery"],
  [/復健/, "physical therapy"],
  [/護理|護士/, "nurse"],
  [/醫院|急診|門診/, "hospital"],
  [/醫師|醫生/, "doctor"],
  [/藥局|藥師/, "pharmacy"],
  [/健檢|體檢/, "medical checkup"],
  [/空氣品質|空污|霧霾/, "air pollution"],
  [/地震/, "earthquake"],
  [/颱風|豪雨|淹水/, "storm"],
];

/** No keyword in the title matched — same generic rotation the assignment used before this changed to per-article search. */
export const FALLBACK_TERMS = ["health", "medical", "wellness", "clinic"];

/** Derives a Pixabay-searchable English term from a (Traditional Chinese) news title; falls back to a rotating generic term if nothing matches. */
export function deriveSearchTerm(title: string, fallbackIndex: number): string {
  for (const [pattern, term] of KEYWORD_TERMS) {
    if (pattern.test(title)) return term;
  }
  return FALLBACK_TERMS[fallbackIndex % FALLBACK_TERMS.length];
}
