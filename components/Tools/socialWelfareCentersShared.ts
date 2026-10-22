/**
 * Pure, DOM-free content and logic for the /tools/social-welfare-centers
 * page (issue #603) — split out of SocialWelfareCentersContent.tsx so it
 * can be exercised with plain `node --test` (no JSX, so no DOM/render
 * harness is needed; this repo has none). The situational-guidance arrays
 * here are the "typed TS array written directly for this tool" content the
 * issue calls for — kept in this sibling module rather than inline in the
 * .tsx file purely so the content and the matching logic are testable at
 * all.
 */

import type { TextWithPhoneLinks } from "@/lib/types/textWithPhoneLinks";

export interface SocialWelfareCenter {
  name: string;
  address: string | null;
  phone: string | null;
  serviceArea: string | null;
}

export interface SituationStep {
  /** Plain string, or a segment array when this step's wording names a hotline number — see lib/types/textWithPhoneLinks.ts. */
  label: TextWithPhoneLinks;
  href?: string;
}

export interface Situation {
  id: string;
  emoji: string;
  title: string;
  /** Plain string, or a segment array when this scenario's wording names a hotline number — see lib/types/textWithPhoneLinks.ts. */
  description: TextWithPhoneLinks;
  steps: SituationStep[];
  officialSource: { label: string; url: string };
  /** Shows the extra browsing-history privacy warning block (issue #603 AC). */
  isAbuseRelated?: boolean;
}

// 一鍵離開的目的地：選一個跟本頁主題完全無關、不會讓人起疑的官方網站首頁。
export const QUICK_EXIT_URL = "https://www.cwa.gov.tw/V8/C/";

export const SITUATIONS: Situation[] = [
  {
    id: "financial-hardship",
    emoji: "💰",
    title: "經濟困難",
    description:
      "臨時收入中斷、急難事件或生活費周轉不來時，社福中心可以協助評估急難紓困、生活扶助金與其他社會救助資源，不需要自己摸索該申請哪一項。",
    steps: [
      {
        label: [
          { text: "撥打 " },
          { tel: "1957", text: "1957" },
          { text: " 福利諮詢專線（免付費，每日 08:00-22:00），由專人依您的狀況轉介適合的補助與資源。" },
        ],
      },
      { label: "線上查詢社會救助相關規定與資格。", href: "https://dep.mohw.gov.tw/DOSAASW/" },
      { label: "攜帶身分證件與收入相關資料，前往住家所在地的社福中心申請評估（見下方查詢）。" },
    ],
    officialSource: { label: "衛生福利部社會救助及社工司", url: "https://dep.mohw.gov.tw/DOSAASW/" },
  },
  {
    id: "caregiver-burnout",
    emoji: "🧑‍🦽",
    title: "照顧壓力",
    description:
      "長期照顧家人造成身心疲憊、喘不過氣，是很多照顧者共同的處境。社福中心與長照體系都能協助分擔照顧壓力，安排喘息服務與其他支持資源。",
    steps: [
      {
        label: [
          { text: "撥打 " },
          { tel: "1966", text: "1966" },
          { text: " 長照服務專線（前 5 分鐘免付費，週一至週五 08:30-12:00、13:30-17:30），申請長照需求評估。" },
        ],
      },
      {
        label: [
          { text: "撥打 " },
          { tel: "1957", text: "1957" },
          { text: " 福利諮詢專線（免付費，每日 08:00-22:00），尋求資源轉介與情緒支持。" },
        ],
      },
      { label: "到住家所在地社福中心洽談喘息服務、關懷訪視等資源（見下方查詢）。" },
    ],
    officialSource: { label: "長期照顧十年計畫 2.0", url: "https://1966.gov.tw" },
  },
  {
    id: "domestic-violence-child-abuse",
    emoji: "🛡️",
    title: "懷疑家暴兒虐",
    description: [
      { text: "如果你自己正在經歷家庭暴力、目睹暴力，或懷疑身邊的兒童、少年正遭受虐待或疏忽，" },
      { tel: "113", text: "113" },
      { text: " 全國保護專線是 24 小時都能撥打的單一窗口，會協助轉介保護、醫療與法律資源。" },
    ],
    steps: [
      {
        label: [
          { text: "立刻撥打 " },
          { tel: "113", text: "113" },
          { text: " 全國保護專線（24 小時、免付費，聽語障人士可撥打 " },
          { tel: "113", text: "113" },
          { text: " 簡訊報案）。" },
        ],
      },
      { label: "線上通報「關懷e起來」，可通報家暴、兒少保護、性侵害等保護性案件。", href: "https://ecare.mohw.gov.tw/" },
      {
        label: [
          { text: "如有立即的生命安全危險，請先撥打 " },
          { tel: "110", text: "110" },
          { text: " 或 " },
          { tel: "119", text: "119" },
          { text: " 求援，再聯繫 " },
          { tel: "113", text: "113" },
          { text: " 後續協助。" },
        ],
      },
    ],
    officialSource: { label: "關懷e起來（保護性案件線上通報）", url: "https://ecare.mohw.gov.tw/" },
    isAbuseRelated: true,
  },
  {
    id: "elderly-living-alone",
    emoji: "🏠",
    title: "獨居長輩",
    description:
      "家中長輩獨居，擔心健康、安全或營養狀況，社福中心與長照體系可以協助安排關懷訪視、緊急救援連線、送餐等服務，不需要家人自己全年無休盯著。",
    steps: [
      {
        label: [{ text: "撥打 " }, { tel: "1957", text: "1957" }, { text: " 福利諮詢專線，詢問所在地的獨居長輩關懷與送餐服務。" }],
      },
      {
        label: [
          { text: "撥打 " },
          { tel: "1966", text: "1966" },
          { text: " 長照服務專線，申請長照需求評估（居家服務、送餐、緊急救援連線等）。" },
        ],
      },
      { label: "聯繫住家所在地社福中心，請社工安排關懷訪視（見下方查詢）。" },
    ],
    officialSource: { label: "衛生福利部社會及家庭署", url: "https://www.sfaa.gov.tw/" },
  },
  {
    id: "teen-pregnancy",
    emoji: "🤰",
    title: "未成年懷孕",
    description:
      "未成年懷孕不需要自己一個人面對。全國未成年懷孕求助專線提供諮詢、資源轉介與陪伴，社福中心也能協助銜接就學、就養或其他社會福利資源。",
    steps: [
      {
        label: [
          { text: "撥打全國未成年懷孕求助專線 " },
          { tel: "0800257085", text: "0800-25-7085" },
          { text: "（衛生福利部社會及家庭署）。" },
        ],
      },
      { label: "查詢線上資源與常見問答。", href: "https://257085.sfaa.gov.tw/" },
      { label: "聯繫住家所在地社福中心，了解可運用的福利資源（見下方查詢）。" },
    ],
    officialSource: { label: "全國未成年懷孕求助資源網", url: "https://257085.sfaa.gov.tw/" },
  },
];

export interface SocialWorkerVisitStep {
  order: number;
  label: string;
}

export const SOCIAL_WORKER_VISIT_STEPS: SocialWorkerVisitStep[] = [
  { order: 1, label: "事前聯繫：除非個案有緊急安全風險或已失聯，社工通常會先電話聯繫，說明來訪目的、大概時間與需要準備的資料。" },
  { order: 2, label: "到府評估：了解家庭目前的生活、經濟、照顧或安全狀況，過程中會詢問一些問題，協助判斷實際需要哪些協助。" },
  { order: 3, label: "轉介資源：依評估結果，協助申請或轉介合適的補助、長照服務、保護安置或其他福利資源。" },
  { order: 4, label: "後續追蹤：定期關懷訪視或電話追蹤，確認資源是否有效運用，狀況有變化時會再協助調整。" },
];

export const SOCIAL_WORKER_VISIT_SOURCE = { label: "衛生福利部社會及家庭署", url: "https://www.sfaa.gov.tw/" };

/** 把「臺」「台」視為同一個字比對。 */
function sameCounty(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/台/g, "臺");
  return norm(a) === norm(b);
}

/** 服務轄區或地址有任一個包含關鍵字，就算符合（兩者都是政府原始文字，不特別清理）。 */
function matchesKeyword(center: SocialWelfareCenter, keyword: string): boolean {
  const kw = keyword.trim();
  if (!kw) return true;
  const haystack = `${center.serviceArea || ""} ${center.address || ""}`;
  return haystack.includes(kw);
}

/**
 * Pure filter — no network calls, no storage reads/writes. `county` empty
 * string means "show every county" (used before the user has picked one).
 */
export function filterSocialWelfareCenters(
  centers: SocialWelfareCenter[],
  options: { county?: string; keyword?: string } = {},
): SocialWelfareCenter[] {
  const county = options.county?.trim() || "";
  const keyword = options.keyword || "";
  return centers.filter((c) => {
    // `address` always starts with the county name after the import
    // pipeline's normalization (see mohwSocialWelfareCenter.ts) — a plain
    // prefix compare, tolerant of the 臺/台 spelling difference.
    if (county) {
      if (!c.address) return false;
      const addrCountyPrefix = c.address.slice(0, county.length);
      if (!sameCounty(addrCountyPrefix, county)) return false;
    }
    return matchesKeyword(c, keyword);
  });
}

/** Great-circle-ish nearest-centroid lookup — same technique already used by EmergencyHotlinesContent, kept local (no shared/cached state). */
export const COUNTY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  基隆市: { lat: 25.1276, lng: 121.7392 },
  臺北市: { lat: 25.033, lng: 121.5654 },
  新北市: { lat: 25.0169, lng: 121.4627 },
  桃園市: { lat: 24.9936, lng: 121.3009 },
  新竹市: { lat: 24.8138, lng: 120.9675 },
  新竹縣: { lat: 24.8387, lng: 121.0177 },
  苗栗縣: { lat: 24.5602, lng: 120.8214 },
  臺中市: { lat: 24.1618, lng: 120.6469 },
  彰化縣: { lat: 24.0518, lng: 120.5161 },
  南投縣: { lat: 23.9609, lng: 120.9719 },
  雲林縣: { lat: 23.7092, lng: 120.4313 },
  嘉義市: { lat: 23.48, lng: 120.4491 },
  嘉義縣: { lat: 23.4518, lng: 120.2559 },
  臺南市: { lat: 22.9997, lng: 120.227 },
  高雄市: { lat: 22.6273, lng: 120.3014 },
  屏東縣: { lat: 22.6828, lng: 120.4879 },
  宜蘭縣: { lat: 24.7021, lng: 121.7377 },
  花蓮縣: { lat: 23.9871, lng: 121.6016 },
  臺東縣: { lat: 22.7583, lng: 121.1444 },
  澎湖縣: { lat: 23.5711, lng: 119.5793 },
  金門縣: { lat: 24.4493, lng: 118.3766 },
  連江縣: { lat: 26.1558, lng: 119.9397 },
};

/** Pure — given coords, returns the nearest county name (or null for an empty table). No I/O. */
export function resolveNearestCounty(lat: number, lng: number): string | null {
  let closest: string | null = null;
  let minDistance = Infinity;
  for (const [name, pos] of Object.entries(COUNTY_CENTROIDS)) {
    const d = (lat - pos.lat) ** 2 + (lng - pos.lng) ** 2;
    if (d < minDistance) {
      minDistance = d;
      closest = name;
    }
  }
  return closest;
}
