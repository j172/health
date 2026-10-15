import type { Locale } from "@/lib/i18n/dictionary";

export interface EpidemicDiseaseNameEntry {
  en: string;
  ja: string;
  ko: string;
}

/**
 * Issue #589 (parent #583) — common-disease-name small dictionary for the
 * 國際疫情 (epidemics) item. Keyed by the exact zh string stored in
 * `cdc_travel_alerts.disease` / `cdc_epidemic_news.disease` — that column
 * IS the canonical/original text (CDC's dataset has no separate English
 * disease field, unlike `country`/`country_en`). Covers every distinct
 * `alert_disease` value in `lib/server/cdc/baselineItems.ts` (29 diseases,
 * checked via a one-off extraction script against the committed baseline
 * used to auto-seed `cdc_travel_alerts`/`cdc_epidemic_news`).
 *
 * AC: "查不到的病名顯示原文而非猜測翻譯" — `resolveDiseaseName` below falls
 * back to the original zh string verbatim for anything not listed here (or
 * when `locale` is `zh-TW`, where no translation is needed at all), never a
 * machine-guessed translation.
 */
export const EPIDEMIC_DISEASE_NAMES: Record<string, EpidemicDiseaseNameEntry> = {
  "M痘": { en: "Mpox (monkeypox)", ja: "エムポックス（サル痘）", ko: "엠폭스(원숭이두창)" },
  伊波拉病毒感染: { en: "Ebola virus disease", ja: "エボラウイルス病", ko: "에볼라바이러스병" },
  兔熱病: { en: "Tularemia", ja: "野兎病", ko: "야토병" },
  "小兒麻痺症/急性無力肢體麻痺": {
    en: "Poliomyelitis / Acute Flaccid Paralysis",
    ja: "急性灰白髄炎（ポリオ）／急性弛緩性麻痺",
    ko: "소아마비/급성이완성마비",
  },
  屈公病: { en: "Chikungunya fever", ja: "チクングニア熱", ko: "치쿤구니야열" },
  急性病毒性A型肝炎: { en: "Acute viral hepatitis A", ja: "急性ウイルス性A型肝炎", ko: "급성 바이러스성 A형 간염" },
  拉薩熱: { en: "Lassa fever", ja: "ラッサ熱", ko: "라사열" },
  新冠併發重症: { en: "Severe complicated COVID-19", ja: "新型コロナウイルス感染症重症", ko: "코로나19 중증 합병증" },
  新型A型流感: { en: "Novel influenza A", ja: "新型インフルエンザA", ko: "신종 인플루엔자 A" },
  旋毛蟲感染症: { en: "Trichinellosis", ja: "旋毛虫症", ko: "선모충증" },
  日本腦炎: { en: "Japanese encephalitis", ja: "日本脳炎", ko: "일본뇌염" },
  沙門氏菌感染症: { en: "Salmonellosis", ja: "サルモネラ症", ko: "살모넬라증" },
  漢他病毒症候群: { en: "Hantavirus syndrome", ja: "ハンタウイルス症候群", ko: "한타바이러스 증후군" },
  炭疽病: { en: "Anthrax", ja: "炭疽", ko: "탄저병" },
  狂犬病: { en: "Rabies", ja: "狂犬病", ko: "광견병" },
  病毒性腸胃炎: { en: "Viral gastroenteritis", ja: "ウイルス性胃腸炎", ko: "바이러스성 위장염" },
  瘧疾: { en: "Malaria", ja: "マラリア", ko: "말라리아" },
  // Issue #462's news↔tool cross-linking keyword ("登革熱") — see catalog.ts's
  // travel-epidemic-alerts entry comment for why 登革熱 matters for this item.
  登革熱: { en: "Dengue fever", ja: "デング熱", ko: "뎅기열" },
  白喉: { en: "Diphtheria", ja: "ジフテリア", ko: "디프테리아" },
  立百病毒感染症: { en: "Nipah virus infection", ja: "ニパウイルス感染症", ko: "니파바이러스 감염증" },
  腸病毒感染併發重症: {
    en: "Severe complications of enterovirus infection",
    ja: "エンテロウイルス感染重症合併症",
    ko: "장바이러스 감염 중증 합병증",
  },
  茲卡病毒感染症: { en: "Zika virus infection", ja: "ジカウイルス感染症", ko: "지카바이러스 감염증" },
  西尼羅熱: { en: "West Nile fever", ja: "西ナイル熱", ko: "웨스트나일열" },
  退伍軍人病: { en: "Legionnaires' disease", ja: "レジオネラ症", ko: "레지오넬라병(재향군인병)" },
  鉤端螺旋體病: { en: "Leptospirosis", ja: "レプトスピラ症", ko: "렙토스피라증" },
  霍亂: { en: "Cholera", ja: "コレラ", ko: "콜레라" },
  馬堡病毒出血熱: { en: "Marburg hemorrhagic fever", ja: "マールブルグ出血熱", ko: "마르부르크출혈열" },
  麻疹: { en: "Measles", ja: "麻疹", ko: "홍역" },
  黃熱病: { en: "Yellow fever", ja: "黄熱", ko: "황열" },
};

/**
 * Resolves `diseaseZh`'s localized name for `locale`. Returns the original
 * text verbatim — never a guessed translation — when `locale` is `zh-TW`
 * (no translation needed) or when `diseaseZh` isn't in
 * `EPIDEMIC_DISEASE_NAMES` (AC: 查不到時顯示原文).
 */
export function resolveDiseaseName(diseaseZh: string, locale: Locale): string {
  const key = (diseaseZh ?? "").trim();
  if (!key || locale === "zh-TW") return diseaseZh;

  const entry = EPIDEMIC_DISEASE_NAMES[key];
  if (!entry) return diseaseZh;

  switch (locale) {
    case "en":
      return entry.en;
    case "ja":
      return entry.ja;
    case "ko":
      return entry.ko;
    default:
      return diseaseZh;
  }
}
