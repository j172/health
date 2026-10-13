import type { PathLocale } from "./dictionary";
import { isTranslatedToolSlug } from "./translatedPages";
import { getLocalizedToolMeta } from "./toolContent";

/**
 * Issue #487: translated display labels for "/nearby"'s facility-type cards
 * (its 8 defaults + the "更多類型" expansion list — see
 * lib/server/nearby/registry.ts's NEARBY_DEFAULT_TYPES/NEARBY_MORE_TYPES).
 * The issue's acceptance criteria require "/nearby" to be exactly as
 * complete in en/ja/ko as the zh version, not an abbreviated one — since
 * nearby surfaces ~40 facility-type categories (far more than the 4
 * `/tools/<slug>` pages this ticket otherwise translates), every one of
 * those labels gets a real short translation here rather than only the few
 * tools that happen to also have their own translated page.
 *
 * For a type whose `key` IS also a `TranslatedToolSlug` (today: "aed",
 * "cool-spots", "tourism-factories"), this reuses that tool's own
 * `getLocalizedToolMeta(...).title` instead of a second, independently
 * maintained copy — see `getLocalizedNearbyLabel` below. The ~35 other
 * types (facilities with no translated `/tools/<slug>` page of their own
 * yet, plus "er"/"shelter" which have no tool page at all) are translated
 * directly here.
 */
const NEARBY_LABEL_I18N: Record<string, Record<PathLocale, string>> = {
  // The 2 non-facilitySearchConfigs defaults (no /tools/<slug> equivalent).
  er: {
    en: "ER Real-Time Congestion",
    ja: "救急外来リアルタイム混雑状況",
    ko: "응급실 실시간 혼잡도",
  },
  shelter: {
    en: "Shelters",
    ja: "避難所",
    ko: "대피소",
  },
  // The other 4 defaults not yet covered by a translated /tools/<slug> page.
  clinics: {
    en: "Clinics & Hospitals",
    ja: "医療機関検索",
    ko: "의료기관 조회",
  },
  pharmacies: {
    en: "Pharmacies",
    ja: "薬局検索",
    ko: "약국 조회",
  },
  "public-toilets": {
    en: "Public Restrooms",
    ja: "公共トイレ検索",
    ko: "공중화장실 조회",
  },
  "disability-atm": {
    en: "Accessible ATMs (Credit Cooperatives)",
    ja: "バリアフリーATM（信用組合）",
    ko: "무장애 ATM(신용협동조합)",
  },
  // "更多類型" expansion list.
  "hakka-bogong": {
    en: "Hakka Affairs Council \"Bo-gong\" Care Stations",
    ja: "客家委員会「伯公照護站」検索",
    ko: "객가위원회 '보공 돌봄 거점' 조회",
  },
  "long-term-care": {
    en: "Long-Term Care Services",
    ja: "長期介護サービス機関検索",
    ko: "장기요양 서비스기관 조회",
  },
  "vet-clinics": {
    en: "Veterinary Clinics & Animal Hospitals",
    ja: "動物病院・獣医診療所検索",
    ko: "동물병원 및 수의 진료소 조회",
  },
  "elder-welfare": {
    en: "Elder Welfare Institutions",
    ja: "高齢者福祉施設検索",
    ko: "노인복지기관 조회",
  },
  "disability-welfare": {
    en: "Disability Welfare Institutions",
    ja: "障害福祉施設検索",
    ko: "장애인복지기관 조회",
  },
  "health-checks": {
    en: "Health Check-Up Institutions",
    ja: "健康診断機関検索",
    ko: "건강검진기관 조회",
  },
  "home-healthcare": {
    en: "Home Healthcare Services",
    ja: "在宅医療検索",
    ko: "재택의료 조회",
  },
  "green-shops": {
    en: "Green Shops & Eco-Label Products",
    ja: "グリーンショップ・環境ラベル商品マップ",
    ko: "녹색 상점 및 친환경 인증 제품 지도",
  },
  "green-hotels": {
    en: "Eco-Label Hotels & Green Lodging",
    ja: "環境ラベル認証ホテル・グリーン宿泊検索",
    ko: "친환경 인증 호텔 및 그린 숙박 조회",
  },
  "child-welfare-nurseries": {
    en: "Parent-Child Centers",
    ja: "親子館検索",
    ko: "가족센터(부모-자녀관) 조회",
  },
  "child-welfare-centers": {
    en: "Child & Youth Welfare Centers",
    ja: "児童・青少年福祉センター検索",
    ko: "아동·청소년복지센터 조회",
  },
  kindergartens: {
    en: "Kindergartens",
    ja: "幼稚園検索",
    ko: "유치원 조회",
  },
  "cram-schools": {
    en: "Cram Schools",
    ja: "短期補習塾検索",
    ko: "학원 조회",
  },
  "iaq-premises": {
    en: "Indoor Air Quality Act Premises",
    ja: "室内空気質法公告施設検索",
    ko: "실내공기질법 공고 시설 조회",
  },
  "cleaning-squads": {
    en: "Local Sanitation Squad Contacts",
    ja: "地域清掃隊連絡先検索",
    ko: "지역 환경미화반 연락처 조회",
  },
  "green-restaurants": {
    en: "Eco-Friendly Restaurants",
    ja: "環境配慮型レストラン検索",
    ko: "친환경 식당 조회",
  },
  "child-safety-spots": {
    en: "Women & Children Safety Alert Spots",
    ja: "婦女・児童安全警戒地点検索",
    ko: "여성·아동 안전 경보 지점 조회",
  },
  bookstores: {
    en: "Independent Bookstores",
    ja: "実店舗書店検索",
    ko: "오프라인 서점 조회",
  },
  "sheltered-workshops": {
    en: "Sheltered Workshops & Disability-Made Products",
    ja: "保護作業所・障害者手作り商品マップ",
    ko: "보호작업장 및 장애인 제품 판매 지도",
  },
  "mental-health": {
    en: "Mental Health Counseling Centers",
    ja: "心理相談所・精神保健センターマップ",
    ko: "심리상담소 및 정신건강센터 지도",
  },
  "smoking-cessation": {
    en: "Smoking Cessation Clinics",
    ja: "禁煙治療・保健指導特約医療機関検索",
    ko: "금연 치료 및 보건교육 지정의료기관 조회",
  },
  "adult-preventive-care": {
    en: "Adult Health Check-Ups & Free Cancer Screening",
    ja: "成人健診・公費がん検診特約医療機関",
    ko: "성인 건강검진 및 공비 암검진 지정의료기관",
  },
  "baby-friendly-hospitals": {
    en: "Baby-Friendly Certified Hospitals",
    ja: "母子に優しい認証医療機関マップ",
    ko: "모자친화 인증 의료기관 지도",
  },
  "rare-disease-care": {
    en: "Rare Disease Care Centers & Diagnosis Hospitals",
    ja: "希少疾病ケア相談センター・確定診断病院",
    ko: "희귀질환 돌봄 상담센터 및 확진 병원",
  },
  "organ-donation-hospitals": {
    en: "Organ Donation Network Hospitals",
    ja: "臓器提供勧募ネットワーク指定病院検索",
    ko: "장기기증 네트워크 지정병원 조회",
  },
  "home-emergency-care": {
    en: "Home Acute Care (NHI) Institutions",
    ja: "健保在宅急病ケア特約機関検索",
    ko: "건강보험 재택 급성기 돌봄 지정기관 조회",
  },
  "pesticide-sales": {
    en: "Licensed Pesticide & Plant Protection Retailers",
    ja: "合法農薬・植物保護資材販売店検索",
    ko: "합법 농약 및 식물보호자재 판매점 조회",
  },
  "hearing-aid-subsidies": {
    en: "Hearing Aid Subsidy Assessment Clinics",
    ja: "補聴器評価特約医療機関名簿",
    ko: "보청기 평가 지정의료기관 명단",
  },
  "funeral-facilities": {
    en: "Licensed Funeral Facilities & Services",
    ja: "合法公私立葬祭施設・ライフセレモニー",
    ko: "합법 공영·민영 장례시설 및 장례서비스",
  },
  "audible-signals": {
    en: "Audible Pedestrian Signals",
    ja: "音声信号機（視覚障害者用）検索",
    ko: "음성신호기(시각장애인용) 조회",
  },
  "accessible-parking": {
    en: "Accessible & Family Parking Spaces",
    ja: "妊婦・親子／身体障害者／福祉バス専用駐車区画検索",
    ko: "임산부·가족/장애인/복지버스 전용 주차구역 조회",
  },
};

/**
 * Resolves `key` (a NearbyTypeDef.key, e.g. "aed", "er", "long-term-care")
 * to its translated label for `locale`. Falls back to the zh `fallbackLabel`
 * only for a key this file genuinely has no entry for (shouldn't happen for
 * any of NEARBY_DEFAULT_TYPES/NEARBY_MORE_TYPES — covered by a test).
 */
export function getLocalizedNearbyLabel(key: string, locale: PathLocale, fallbackLabel: string): string {
  if (isTranslatedToolSlug(key)) {
    return getLocalizedToolMeta(key, locale).title;
  }
  return NEARBY_LABEL_I18N[key]?.[locale] ?? fallbackLabel;
}
