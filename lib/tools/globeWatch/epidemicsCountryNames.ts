import type { Locale } from "@/lib/i18n/dictionary";

export interface EpidemicCountryNameEntry {
  zh: string;
  en: string;
  ja: string;
  ko: string;
}

/**
 * Issue #589 (parent #583) — ISO 3166-1 alpha-2 → localized country name,
 * for the 國際疫情 (epidemics) item's choropleth legend/country-detail
 * panel. Covers every ISO code that actually appears in `cdc_travel_alerts`
 * / `cdc_epidemic_news` (checked against `lib/server/cdc/baselineItems.ts`,
 * the committed snapshot of real CDC data used to auto-seed those tables —
 * 89 distinct 2-letter codes after splitting the dataset's occasional
 * multi-country advisory rows, e.g. `"DZ,TD,GN,MR,NE,NG,ML,SN,ZA"`, back
 * into individual codes) plus `TW` itself, which never appears in CDC's own
 * data (Taiwan doesn't issue a travel alert about itself) but needs a label
 * since the Natural Earth boundary file plots it as its own feature.
 *
 * AC: "查不到時顯示原文，不猜測翻譯" — this is deliberately a closed,
 * hand-checked table, never a machine-translated catch-all. `resolveCountryName`
 * below falls back to the caller's own original text (DB's `country`/
 * `countryEn`) for anything not listed here, not a guess from this file.
 */
export const EPIDEMIC_COUNTRY_NAMES: Record<string, EpidemicCountryNameEntry> = {
  AF: { zh: "阿富汗", en: "Afghanistan", ja: "アフガニスタン", ko: "아프가니스탄" },
  AO: { zh: "安哥拉", en: "Angola", ja: "アンゴラ", ko: "앙골라" },
  AR: { zh: "阿根廷", en: "Argentina", ja: "アルゼンチン", ko: "아르헨티나" },
  AU: { zh: "澳大利亞", en: "Australia", ja: "オーストラリア", ko: "오스트레일리아" },
  AZ: { zh: "亞塞拜然", en: "Azerbaijan", ja: "アゼルバイジャン", ko: "아제르바이잔" },
  BD: { zh: "孟加拉", en: "Bangladesh", ja: "バングラデシュ", ko: "방글라데시" },
  BI: { zh: "蒲隆地", en: "Burundi", ja: "ブルンジ", ko: "부룬디" },
  BO: { zh: "玻利維亞", en: "Bolivia", ja: "ボリビア", ko: "볼리비아" },
  BR: { zh: "巴西", en: "Brazil", ja: "ブラジル", ko: "브라질" },
  CA: { zh: "加拿大", en: "Canada", ja: "カナダ", ko: "캐나다" },
  CD: { zh: "剛果民主共和國", en: "Democratic Republic of the Congo", ja: "コンゴ民主共和国", ko: "콩고민주공화국" },
  CF: { zh: "中非共和國", en: "Central African Republic", ja: "中央アフリカ共和国", ko: "중앙아프리카공화국" },
  CH: { zh: "瑞士", en: "Switzerland", ja: "スイス", ko: "스위스" },
  CL: { zh: "智利", en: "Chile", ja: "チリ", ko: "칠레" },
  CM: { zh: "喀麥隆", en: "Cameroon", ja: "カメルーン", ko: "카메룬" },
  CN: { zh: "中國大陸", en: "China", ja: "中国", ko: "중국" },
  CO: { zh: "哥倫比亞", en: "Colombia", ja: "コロンビア", ko: "콜롬비아" },
  CR: { zh: "哥斯大黎加", en: "Costa Rica", ja: "コスタリカ", ko: "코스타리카" },
  CU: { zh: "古巴", en: "Cuba", ja: "キューバ", ko: "쿠바" },
  DO: { zh: "多明尼加", en: "Dominican Republic", ja: "ドミニカ共和国", ko: "도미니카 공화국" },
  DZ: { zh: "阿爾及利亞", en: "Algeria", ja: "アルジェリア", ko: "알제리" },
  EC: { zh: "厄瓜多", en: "Ecuador", ja: "エクアドル", ko: "에콰도르" },
  ES: { zh: "西班牙", en: "Spain", ja: "スペイン", ko: "스페인" },
  ET: { zh: "衣索比亞", en: "Ethiopia", ja: "エチオピア", ko: "에티오피아" },
  FR: { zh: "法國", en: "France", ja: "フランス", ko: "프랑스" },
  GB: { zh: "英國", en: "United Kingdom", ja: "イギリス", ko: "영국" },
  GF: { zh: "法屬圭亞那", en: "French Guiana", ja: "フランス領ギアナ", ko: "프랑스령 기아나" },
  GH: { zh: "迦納共和國", en: "Ghana", ja: "ガーナ", ko: "가나" },
  GN: { zh: "幾內亞", en: "Guinea", ja: "ギニア", ko: "기니" },
  GR: { zh: "希臘", en: "Greece", ja: "ギリシャ", ko: "그리스" },
  GT: { zh: "瓜地馬拉", en: "Guatemala", ja: "グアテマラ", ko: "과테말라" },
  GW: { zh: "幾內亞比索", en: "Guinea-Bissau", ja: "ギニアビサウ", ko: "기니비사우" },
  HK: { zh: "香港特別行政區", en: "Hong Kong SAR", ja: "香港", ko: "홍콩" },
  HT: { zh: "海地", en: "Haiti", ja: "ハイチ", ko: "아이티" },
  ID: { zh: "印尼", en: "Indonesia", ja: "インドネシア", ko: "인도네시아" },
  IL: { zh: "以色列", en: "Israel", ja: "イスラエル", ko: "이스라엘" },
  IN: { zh: "印度", en: "India", ja: "インド", ko: "인도" },
  IT: { zh: "義大利", en: "Italy", ja: "イタリア", ko: "이탈리아" },
  JO: { zh: "約旦", en: "Jordan", ja: "ヨルダン", ko: "요르단" },
  JP: { zh: "日本", en: "Japan", ja: "日本", ko: "일본" },
  KE: { zh: "肯亞", en: "Kenya", ja: "ケニア", ko: "케냐" },
  KH: { zh: "柬埔寨", en: "Cambodia", ja: "カンボジア", ko: "캄보디아" },
  KI: { zh: "吉里巴斯", en: "Kiribati", ja: "キリバス", ko: "키리바시" },
  KR: { zh: "韓國", en: "South Korea", ja: "韓国", ko: "대한민국" },
  KZ: { zh: "哈薩克", en: "Kazakhstan", ja: "カザフスタン", ko: "카자흐스탄" },
  LA: { zh: "寮國", en: "Laos", ja: "ラオス", ko: "라오스" },
  LK: { zh: "斯里蘭卡", en: "Sri Lanka", ja: "スリランカ", ko: "스리랑카" },
  LR: { zh: "賴比瑞亞", en: "Liberia", ja: "リベリア", ko: "라이베리아" },
  LT: { zh: "立陶宛", en: "Lithuania", ja: "リトアニア", ko: "리투아니아" },
  MG: { zh: "馬達加斯加", en: "Madagascar", ja: "マダガスカル", ko: "마다가스카르" },
  ML: { zh: "馬利", en: "Mali", ja: "マリ", ko: "말리" },
  MM: { zh: "緬甸", en: "Myanmar", ja: "ミャンマー", ko: "미얀마" },
  MR: { zh: "茅利塔尼亞", en: "Mauritania", ja: "モーリタニア", ko: "모리타니" },
  MV: { zh: "馬爾地夫", en: "Maldives", ja: "モルディブ", ko: "몰디브" },
  MW: { zh: "馬拉威", en: "Malawi", ja: "マラウイ", ko: "말라위" },
  MX: { zh: "墨西哥", en: "Mexico", ja: "メキシコ", ko: "멕시코" },
  MY: { zh: "馬來西亞", en: "Malaysia", ja: "マレーシア", ko: "말레이시아" },
  NA: { zh: "納米比亞", en: "Namibia", ja: "ナミビア", ko: "나미비아" },
  NE: { zh: "尼日", en: "Niger", ja: "ニジェール", ko: "니제르" },
  NG: { zh: "奈及利亞", en: "Nigeria", ja: "ナイジェリア", ko: "나이지리아" },
  NP: { zh: "尼泊爾", en: "Nepal", ja: "ネパール", ko: "네팔" },
  PE: { zh: "秘魯", en: "Peru", ja: "ペルー", ko: "페루" },
  PG: { zh: "巴布亞紐幾內亞", en: "Papua New Guinea", ja: "パプアニューギニア", ko: "파푸아뉴기니" },
  PH: { zh: "菲律賓", en: "Philippines", ja: "フィリピン", ko: "필리핀" },
  PK: { zh: "巴基斯坦", en: "Pakistan", ja: "パキスタン", ko: "파키스탄" },
  PT: { zh: "葡萄牙", en: "Portugal", ja: "ポルトガル", ko: "포르투갈" },
  PY: { zh: "巴拉圭共和國", en: "Paraguay", ja: "パラグアイ", ko: "파라과이" },
  RE: { zh: "法屬留尼旺島", en: "Réunion", ja: "レユニオン", ko: "레위니옹" },
  RS: { zh: "塞爾維亞共和國", en: "Serbia", ja: "セルビア", ko: "세르비아" },
  RU: { zh: "俄羅斯", en: "Russia", ja: "ロシア", ko: "러시아" },
  SC: { zh: "塞席爾", en: "Seychelles", ja: "セーシェル", ko: "세이셸" },
  SD: { zh: "蘇丹", en: "Sudan", ja: "スーダン", ko: "수단" },
  SE: { zh: "瑞典", en: "Sweden", ja: "スウェーデン", ko: "스웨덴" },
  SG: { zh: "新加坡", en: "Singapore", ja: "シンガポール", ko: "싱가포르" },
  SN: { zh: "塞內加爾", en: "Senegal", ja: "セネガル", ko: "세네갈" },
  SO: { zh: "索馬利亞", en: "Somalia", ja: "ソマリア", ko: "소말리아" },
  SS: { zh: "南蘇丹共和國", en: "South Sudan", ja: "南スーダン", ko: "남수단" },
  TD: { zh: "查德", en: "Chad", ja: "チャド", ko: "차드" },
  TH: { zh: "泰國", en: "Thailand", ja: "タイ", ko: "태국" },
  TR: { zh: "土耳其", en: "Türkiye", ja: "トルコ", ko: "튀르키예" },
  TW: { zh: "台灣", en: "Taiwan", ja: "台湾", ko: "대만" },
  UA: { zh: "烏克蘭", en: "Ukraine", ja: "ウクライナ", ko: "우크라이나" },
  UG: { zh: "烏干達", en: "Uganda", ja: "ウガンダ", ko: "우간다" },
  US: { zh: "美國", en: "United States", ja: "アメリカ合衆国", ko: "미국" },
  VE: { zh: "委內瑞拉", en: "Venezuela", ja: "ベネズエラ", ko: "베네수엘라" },
  VN: { zh: "越南", en: "Vietnam", ja: "ベトナム", ko: "베트남" },
  YE: { zh: "葉門", en: "Yemen", ja: "イエメン", ko: "예멘" },
  YT: { zh: "法屬馬約特島", en: "Mayotte", ja: "マヨット", ko: "마요트" },
  ZA: { zh: "南非", en: "South Africa", ja: "南アフリカ", ko: "남아프리카공화국" },
  ZM: { zh: "尚比亞", en: "Zambia", ja: "ザンビア", ko: "잠비아" },
};

/**
 * Resolves `iso`'s localized name for `locale`. When `iso` isn't in
 * `EPIDEMIC_COUNTRY_NAMES` (unlisted/unknown code), returns `fallback` (the
 * DB row's own original `country`/`countryEn` text) verbatim if given,
 * otherwise the bare ISO code — never a guessed translation (AC).
 */
export function resolveCountryName(
  iso: string | null | undefined,
  locale: Locale,
  fallback?: string | null,
): string {
  const code = (iso ?? "").trim().toUpperCase();
  const entry = code ? EPIDEMIC_COUNTRY_NAMES[code] : undefined;

  if (entry) {
    switch (locale) {
      case "en":
        return entry.en;
      case "ja":
        return entry.ja;
      case "ko":
        return entry.ko;
      default:
        return entry.zh;
    }
  }

  const trimmedFallback = (fallback ?? "").trim();
  if (trimmedFallback) return trimmedFallback;
  return code;
}
