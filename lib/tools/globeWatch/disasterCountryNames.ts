import type { Locale } from "@/lib/i18n/dictionary";

export interface DisasterCountryNameEntry {
  zh: string;
  en: string;
  ja: string;
  ko: string;
}

/**
 * Issue #594 (parent #583) — ISO 3166-1 **alpha-3** → localized country
 * name, for the "全球災害" (disasters) item's list rows and marker popups.
 * Keyed by alpha-3 (not alpha-2 like
 * lib/tools/globeWatch/epidemicsCountryNames.ts's dictionary) because
 * `gdacs_events.country_iso` stores GDACS's own `iso3` field (see
 * lib/server/gdacs/types.ts / sources/gdacs.ts) — the two dictionaries are
 * intentionally separate, keyed tables, not a shared one, since merging them
 * would require every consumer to agree on one alpha-2/alpha-3 convention.
 *
 * Unlike the epidemics dictionary (closed-world: every ISO code that can
 * ever appear is already known from CDC's static baseline CSV), GDACS
 * tracks disasters worldwide and which country appears next is inherently
 * unpredictable — so this is a best-effort table covering the ~150 most
 * commonly GDACS-flagged countries (every continent, with extra weight on
 * flood/volcano/drought/wildfire-prone regions), not an exhaustive list of
 * all 195+ ISO 3166-1 entries. `resolveCountryName` below falls back to the
 * raw ISO3 code verbatim for anything not listed here — **never** a guessed
 * translation (AC: 查不到時顯示原文) — so an unlisted country still renders
 * something stable and correct, just not translated.
 */
export const DISASTER_COUNTRY_NAMES: Record<string, DisasterCountryNameEntry> = {
  AFG: { zh: "阿富汗", en: "Afghanistan", ja: "アフガニスタン", ko: "아프가니스탄" },
  AGO: { zh: "安哥拉", en: "Angola", ja: "アンゴラ", ko: "앙골라" },
  ALB: { zh: "阿爾巴尼亞", en: "Albania", ja: "アルバニア", ko: "알바니아" },
  ARE: { zh: "阿拉伯聯合大公國", en: "United Arab Emirates", ja: "アラブ首長国連邦", ko: "아랍에미리트" },
  ARG: { zh: "阿根廷", en: "Argentina", ja: "アルゼンチン", ko: "아르헨티나" },
  ARM: { zh: "亞美尼亞", en: "Armenia", ja: "アルメニア", ko: "아르메니아" },
  AUS: { zh: "澳大利亞", en: "Australia", ja: "オーストラリア", ko: "오스트레일리아" },
  AUT: { zh: "奧地利", en: "Austria", ja: "オーストリア", ko: "오스트리아" },
  AZE: { zh: "亞塞拜然", en: "Azerbaijan", ja: "アゼルバイジャン", ko: "아제르바이잔" },
  BDI: { zh: "蒲隆地", en: "Burundi", ja: "ブルンジ", ko: "부룬디" },
  BEL: { zh: "比利時", en: "Belgium", ja: "ベルギー", ko: "벨기에" },
  BEN: { zh: "貝南", en: "Benin", ja: "ベナン", ko: "베냉" },
  BGD: { zh: "孟加拉", en: "Bangladesh", ja: "バングラデシュ", ko: "방글라데시" },
  BGR: { zh: "保加利亞", en: "Bulgaria", ja: "ブルガリア", ko: "불가리아" },
  BIH: { zh: "波士尼亞與赫塞哥維納", en: "Bosnia and Herzegovina", ja: "ボスニア・ヘルツェゴビナ", ko: "보스니아 헤르체고비나" },
  BLZ: { zh: "貝里斯", en: "Belize", ja: "ベリーズ", ko: "벨리즈" },
  BOL: { zh: "玻利維亞", en: "Bolivia", ja: "ボリビア", ko: "볼리비아" },
  BRA: { zh: "巴西", en: "Brazil", ja: "ブラジル", ko: "브라질" },
  BRN: { zh: "汶萊", en: "Brunei", ja: "ブルネイ", ko: "브루나이" },
  BTN: { zh: "不丹", en: "Bhutan", ja: "ブータン", ko: "부탄" },
  BWA: { zh: "波札那", en: "Botswana", ja: "ボツワナ", ko: "보츠와나" },
  CAF: { zh: "中非共和國", en: "Central African Republic", ja: "中央アフリカ共和国", ko: "중앙아프리카공화국" },
  CAN: { zh: "加拿大", en: "Canada", ja: "カナダ", ko: "캐나다" },
  CHE: { zh: "瑞士", en: "Switzerland", ja: "スイス", ko: "스위스" },
  CHL: { zh: "智利", en: "Chile", ja: "チリ", ko: "칠레" },
  CHN: { zh: "中國大陸", en: "China", ja: "中国", ko: "중국" },
  CIV: { zh: "象牙海岸", en: "Côte d'Ivoire", ja: "コートジボワール", ko: "코트디부아르" },
  CMR: { zh: "喀麥隆", en: "Cameroon", ja: "カメルーン", ko: "카메룬" },
  COD: { zh: "剛果民主共和國", en: "Democratic Republic of the Congo", ja: "コンゴ民主共和国", ko: "콩고민주공화국" },
  COG: { zh: "剛果共和國", en: "Republic of the Congo", ja: "コンゴ共和国", ko: "콩고공화국" },
  COL: { zh: "哥倫比亞", en: "Colombia", ja: "コロンビア", ko: "콜롬비아" },
  COM: { zh: "葛摩", en: "Comoros", ja: "コモロ", ko: "코모로" },
  CRI: { zh: "哥斯大黎加", en: "Costa Rica", ja: "コスタリカ", ko: "코스타리카" },
  CUB: { zh: "古巴", en: "Cuba", ja: "キューバ", ko: "쿠바" },
  CZE: { zh: "捷克", en: "Czechia", ja: "チェコ", ko: "체코" },
  DEU: { zh: "德國", en: "Germany", ja: "ドイツ", ko: "독일" },
  DJI: { zh: "吉布地", en: "Djibouti", ja: "ジブチ", ko: "지부티" },
  DNK: { zh: "丹麥", en: "Denmark", ja: "デンマーク", ko: "덴마크" },
  DOM: { zh: "多明尼加", en: "Dominican Republic", ja: "ドミニカ共和国", ko: "도미니카 공화국" },
  DZA: { zh: "阿爾及利亞", en: "Algeria", ja: "アルジェリア", ko: "알제리" },
  ECU: { zh: "厄瓜多", en: "Ecuador", ja: "エクアドル", ko: "에콰도르" },
  EGY: { zh: "埃及", en: "Egypt", ja: "エジプト", ko: "이집트" },
  ESP: { zh: "西班牙", en: "Spain", ja: "スペイン", ko: "스페인" },
  EST: { zh: "愛沙尼亞", en: "Estonia", ja: "エストニア", ko: "에스토니아" },
  ETH: { zh: "衣索比亞", en: "Ethiopia", ja: "エチオピア", ko: "에티오피아" },
  FIN: { zh: "芬蘭", en: "Finland", ja: "フィンランド", ko: "핀란드" },
  FJI: { zh: "斐濟", en: "Fiji", ja: "フィジー", ko: "피지" },
  FRA: { zh: "法國", en: "France", ja: "フランス", ko: "프랑스" },
  GAB: { zh: "加彭", en: "Gabon", ja: "ガボン", ko: "가봉" },
  GBR: { zh: "英國", en: "United Kingdom", ja: "イギリス", ko: "영국" },
  GEO: { zh: "喬治亞", en: "Georgia", ja: "ジョージア", ko: "조지아" },
  GHA: { zh: "迦納共和國", en: "Ghana", ja: "ガーナ", ko: "가나" },
  GIN: { zh: "幾內亞", en: "Guinea", ja: "ギニア", ko: "기니" },
  GMB: { zh: "甘比亞", en: "Gambia", ja: "ガンビア", ko: "감비아" },
  GNB: { zh: "幾內亞比索", en: "Guinea-Bissau", ja: "ギニアビサウ", ko: "기니비사우" },
  GRC: { zh: "希臘", en: "Greece", ja: "ギリシャ", ko: "그리스" },
  GTM: { zh: "瓜地馬拉", en: "Guatemala", ja: "グアテマラ", ko: "과테말라" },
  GUY: { zh: "蓋亞那", en: "Guyana", ja: "ガイアナ", ko: "가이아나" },
  HND: { zh: "宏都拉斯", en: "Honduras", ja: "ホンジュラス", ko: "온두라스" },
  HRV: { zh: "克羅埃西亞", en: "Croatia", ja: "クロアチア", ko: "크로아티아" },
  HTI: { zh: "海地", en: "Haiti", ja: "ハイチ", ko: "아이티" },
  HUN: { zh: "匈牙利", en: "Hungary", ja: "ハンガリー", ko: "헝가리" },
  IDN: { zh: "印尼", en: "Indonesia", ja: "インドネシア", ko: "인도네시아" },
  IND: { zh: "印度", en: "India", ja: "インド", ko: "인도" },
  IRL: { zh: "愛爾蘭", en: "Ireland", ja: "アイルランド", ko: "아일랜드" },
  IRN: { zh: "伊朗", en: "Iran", ja: "イラン", ko: "이란" },
  IRQ: { zh: "伊拉克", en: "Iraq", ja: "イラク", ko: "이라크" },
  ISL: { zh: "冰島", en: "Iceland", ja: "アイスランド", ko: "아이슬란드" },
  ISR: { zh: "以色列", en: "Israel", ja: "イスラエル", ko: "이스라엘" },
  ITA: { zh: "義大利", en: "Italy", ja: "イタリア", ko: "이탈리아" },
  JAM: { zh: "牙買加", en: "Jamaica", ja: "ジャマイカ", ko: "자메이카" },
  JOR: { zh: "約旦", en: "Jordan", ja: "ヨルダン", ko: "요르단" },
  JPN: { zh: "日本", en: "Japan", ja: "日本", ko: "일본" },
  KAZ: { zh: "哈薩克", en: "Kazakhstan", ja: "カザフスタン", ko: "카자흐스탄" },
  KEN: { zh: "肯亞", en: "Kenya", ja: "ケニア", ko: "케냐" },
  KGZ: { zh: "吉爾吉斯", en: "Kyrgyzstan", ja: "キルギス", ko: "키르기스스탄" },
  KHM: { zh: "柬埔寨", en: "Cambodia", ja: "カンボジア", ko: "캄보디아" },
  KIR: { zh: "吉里巴斯", en: "Kiribati", ja: "キリバス", ko: "키리바시" },
  KOR: { zh: "韓國", en: "South Korea", ja: "韓国", ko: "대한민국" },
  LAO: { zh: "寮國", en: "Laos", ja: "ラオス", ko: "라오스" },
  LBN: { zh: "黎巴嫩", en: "Lebanon", ja: "レバノン", ko: "레바논" },
  LBR: { zh: "賴比瑞亞", en: "Liberia", ja: "リベリア", ko: "라이베리아" },
  LBY: { zh: "利比亞", en: "Libya", ja: "リビア", ko: "리비아" },
  LKA: { zh: "斯里蘭卡", en: "Sri Lanka", ja: "スリランカ", ko: "스리랑카" },
  LTU: { zh: "立陶宛", en: "Lithuania", ja: "リトアニア", ko: "리투아니아" },
  LVA: { zh: "拉脫維亞", en: "Latvia", ja: "ラトビア", ko: "라트비아" },
  MAR: { zh: "摩洛哥", en: "Morocco", ja: "モロッコ", ko: "모로코" },
  MDA: { zh: "摩爾多瓦", en: "Moldova", ja: "モルドバ", ko: "몰도바" },
  MDG: { zh: "馬達加斯加", en: "Madagascar", ja: "マダガスカル", ko: "마다가스카르" },
  MEX: { zh: "墨西哥", en: "Mexico", ja: "メキシコ", ko: "멕시코" },
  MKD: { zh: "北馬其頓", en: "North Macedonia", ja: "北マケドニア", ko: "북마케도니아" },
  MLI: { zh: "馬利", en: "Mali", ja: "マリ", ko: "말리" },
  MMR: { zh: "緬甸", en: "Myanmar", ja: "ミャンマー", ko: "미얀마" },
  MNE: { zh: "蒙特內哥羅", en: "Montenegro", ja: "モンテネグロ", ko: "몬테네그로" },
  MNG: { zh: "蒙古", en: "Mongolia", ja: "モンゴル", ko: "몽골" },
  MOZ: { zh: "莫三比克", en: "Mozambique", ja: "モザンビーク", ko: "모잠비크" },
  MRT: { zh: "茅利塔尼亞", en: "Mauritania", ja: "モーリタニア", ko: "모리타니" },
  MUS: { zh: "模里西斯", en: "Mauritius", ja: "モーリシャス", ko: "모리셔스" },
  MWI: { zh: "馬拉威", en: "Malawi", ja: "マラウイ", ko: "말라위" },
  MYS: { zh: "馬來西亞", en: "Malaysia", ja: "マレーシア", ko: "말레이시아" },
  NAM: { zh: "納米比亞", en: "Namibia", ja: "ナミビア", ko: "나미비아" },
  NER: { zh: "尼日", en: "Niger", ja: "ニジェール", ko: "니제르" },
  NGA: { zh: "奈及利亞", en: "Nigeria", ja: "ナイジェリア", ko: "나이지리아" },
  NIC: { zh: "尼加拉瓜", en: "Nicaragua", ja: "ニカラグア", ko: "니카라과" },
  NLD: { zh: "荷蘭", en: "Netherlands", ja: "オランダ", ko: "네덜란드" },
  NOR: { zh: "挪威", en: "Norway", ja: "ノルウェー", ko: "노르웨이" },
  NPL: { zh: "尼泊爾", en: "Nepal", ja: "ネパール", ko: "네팔" },
  NZL: { zh: "紐西蘭", en: "New Zealand", ja: "ニュージーランド", ko: "뉴질랜드" },
  OMN: { zh: "阿曼", en: "Oman", ja: "オマーン", ko: "오만" },
  PAK: { zh: "巴基斯坦", en: "Pakistan", ja: "パキスタン", ko: "파키스탄" },
  PAN: { zh: "巴拿馬", en: "Panama", ja: "パナマ", ko: "파나마" },
  PER: { zh: "秘魯", en: "Peru", ja: "ペルー", ko: "페루" },
  PHL: { zh: "菲律賓", en: "Philippines", ja: "フィリピン", ko: "필리핀" },
  PNG: { zh: "巴布亞紐幾內亞", en: "Papua New Guinea", ja: "パプアニューギニア", ko: "파푸아뉴기니" },
  POL: { zh: "波蘭", en: "Poland", ja: "ポーランド", ko: "폴란드" },
  PRK: { zh: "北韓", en: "North Korea", ja: "北朝鮮", ko: "조선민주주의인민공화국" },
  PRT: { zh: "葡萄牙", en: "Portugal", ja: "ポルトガル", ko: "포르투갈" },
  PRY: { zh: "巴拉圭", en: "Paraguay", ja: "パラグアイ", ko: "파라과이" },
  ROU: { zh: "羅馬尼亞", en: "Romania", ja: "ルーマニア", ko: "루마니아" },
  RUS: { zh: "俄羅斯", en: "Russia", ja: "ロシア", ko: "러시아" },
  RWA: { zh: "盧安達", en: "Rwanda", ja: "ルワンダ", ko: "르완다" },
  SAU: { zh: "沙烏地阿拉伯", en: "Saudi Arabia", ja: "サウジアラビア", ko: "사우디아라비아" },
  SDN: { zh: "蘇丹", en: "Sudan", ja: "スーダン", ko: "수단" },
  SEN: { zh: "塞內加爾", en: "Senegal", ja: "セネガル", ko: "세네갈" },
  SLB: { zh: "索羅門群島", en: "Solomon Islands", ja: "ソロモン諸島", ko: "솔로몬 제도" },
  SLE: { zh: "獅子山", en: "Sierra Leone", ja: "シエラレオネ", ko: "시에라리온" },
  SLV: { zh: "薩爾瓦多", en: "El Salvador", ja: "エルサルバドル", ko: "엘살바도르" },
  SOM: { zh: "索馬利亞", en: "Somalia", ja: "ソマリア", ko: "소말리아" },
  SRB: { zh: "塞爾維亞", en: "Serbia", ja: "セルビア", ko: "세르비아" },
  SSD: { zh: "南蘇丹", en: "South Sudan", ja: "南スーダン", ko: "남수단" },
  SUR: { zh: "蘇利南", en: "Suriname", ja: "スリナム", ko: "수리남" },
  SVK: { zh: "斯洛伐克", en: "Slovakia", ja: "スロバキア", ko: "슬로바키아" },
  SVN: { zh: "斯洛維尼亞", en: "Slovenia", ja: "スロベニア", ko: "슬로베니아" },
  SWE: { zh: "瑞典", en: "Sweden", ja: "スウェーデン", ko: "스웨덴" },
  SYR: { zh: "敘利亞", en: "Syria", ja: "シリア", ko: "시리아" },
  TCD: { zh: "查德", en: "Chad", ja: "チャド", ko: "차드" },
  TGO: { zh: "多哥", en: "Togo", ja: "トーゴ", ko: "토고" },
  THA: { zh: "泰國", en: "Thailand", ja: "タイ", ko: "태국" },
  TJK: { zh: "塔吉克", en: "Tajikistan", ja: "タジキスタン", ko: "타지키스탄" },
  TLS: { zh: "東帝汶", en: "Timor-Leste", ja: "東ティモール", ko: "동티모르" },
  TON: { zh: "東加", en: "Tonga", ja: "トンガ", ko: "통가" },
  TTO: { zh: "千里達及托巴哥", en: "Trinidad and Tobago", ja: "トリニダード・トバゴ", ko: "트리니다드 토바고" },
  TUN: { zh: "突尼西亞", en: "Tunisia", ja: "チュニジア", ko: "튀니지" },
  TUR: { zh: "土耳其", en: "Türkiye", ja: "トルコ", ko: "튀르키예" },
  TWN: { zh: "台灣", en: "Taiwan", ja: "台湾", ko: "대만" },
  TZA: { zh: "坦尚尼亞", en: "Tanzania", ja: "タンザニア", ko: "탄자니아" },
  UGA: { zh: "烏干達", en: "Uganda", ja: "ウガンダ", ko: "우간다" },
  UKR: { zh: "烏克蘭", en: "Ukraine", ja: "ウクライナ", ko: "우크라이나" },
  URY: { zh: "烏拉圭", en: "Uruguay", ja: "ウルグアイ", ko: "우루과이" },
  USA: { zh: "美國", en: "United States", ja: "アメリカ合衆国", ko: "미국" },
  UZB: { zh: "烏茲別克", en: "Uzbekistan", ja: "ウズベキスタン", ko: "우즈베키스탄" },
  VCT: { zh: "聖文森及格瑞那丁", en: "Saint Vincent and the Grenadines", ja: "セントビンセント及びグレナディーン諸島", ko: "세인트빈센트 그레나딘" },
  VEN: { zh: "委內瑞拉", en: "Venezuela", ja: "ベネズエラ", ko: "베네수엘라" },
  VNM: { zh: "越南", en: "Vietnam", ja: "ベトナム", ko: "베트남" },
  VUT: { zh: "萬那杜", en: "Vanuatu", ja: "バヌアツ", ko: "바누아투" },
  WSM: { zh: "薩摩亞", en: "Samoa", ja: "サモア", ko: "사모아" },
  YEM: { zh: "葉門", en: "Yemen", ja: "イエメン", ko: "예멘" },
  ZAF: { zh: "南非", en: "South Africa", ja: "南アフリカ", ko: "남아프리카공화국" },
  ZMB: { zh: "尚比亞", en: "Zambia", ja: "ザンビア", ko: "잠비아" },
  ZWE: { zh: "辛巴威", en: "Zimbabwe", ja: "ジンバブエ", ko: "짐바브웨" },
};

/**
 * Resolves `iso3`'s localized name for `locale`. Falls back to the raw ISO3
 * code verbatim — never a guessed translation — when `iso3` is missing or
 * isn't in `DISASTER_COUNTRY_NAMES` (AC: 查不到時顯示原文；`gdacs_events` has
 * no separate original-language country-name column to fall back to, see
 * this module's doc comment, so the ISO3 code itself is the "original text").
 */
export function resolveCountryName(iso3: string | null | undefined, locale: Locale): string {
  const code = (iso3 ?? "").trim().toUpperCase();
  if (!code) return code;
  const entry = DISASTER_COUNTRY_NAMES[code];
  if (!entry) return code;

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
