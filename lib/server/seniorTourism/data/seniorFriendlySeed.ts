import { TAIWAN_COUNTIES } from "@/lib/constants/taiwanDistricts";

/**
 * Fallback seed data for /tools/senior-friendly (issue #436) — mirrors
 * lib/server/transit/data/transitSeed.ts's pattern: shown only while the
 * relevant table is empty (see ensureSeniorFriendlySeeded() in
 * ../queries.ts), so the page never ships completely blank if the TDX
 * "Senior" base path (see tdxClient.ts's base-path comment) is still 404ing.
 *
 * SENIOR_CARD_SUBSIDIES_SEED covers all 22 counties (the spec's priority —
 * "這是使用者最常查的"). Per-county benefit amounts/eligibility details vary
 * and change over time, and the exact TDX response was never seen live (same
 * blocked base path), so each row deliberately states only the generally-true
 * eligibility rule and points to the one nationwide, always-correct referral
 * channel (衛福部 1957 福利諮詢專線) rather than a guessed county-specific deep
 * link that could go stale or simply be wrong. A successful TDX sync
 * overwrites these with the real per-county authority name/URL once the base
 * path is fixed (see runSync.ts's ensureSeniorFriendlySeeded() gate — it only
 * seeds when the table is empty, so a real sync's rows always take priority).
 */
export const SENIOR_CARD_SUBSIDIES_SEED: Array<{
  county: string;
  cardName: string;
  infoUrl: string;
  category: string;
  description: string;
}> = TAIWAN_COUNTIES.map((county) => ({
  county,
  cardName: "敬老卡",
  infoUrl: "https://1957.mohw.gov.tw/",
  category: "公車／捷運等大眾運輸搭乘優惠",
  description:
    `設籍${county}且年滿65歲以上（55歲以上原住民）長者，可於戶籍地申請敬老卡（多整合於悠遊卡／一卡通），享當地公車、捷運等大眾運輸搭乘優惠。各縣市補助額度、是否需定期儲值與是否涵蓋其他運具略有不同，請洽當地社會局（處）或撥打衛福部 1957 福利諮詢專線查詢最新規定。`,
}));

/** A handful of well-known accessible attractions across different counties, kept small and generic on purpose (see file header). */
export const SENIOR_TOURISM_FACILITIES_SEED: Array<{
  attractionId: string;
  attractionName: string;
  county: string;
  category: string;
  facilityName: string;
  description: string | null;
}> = [
  {
    attractionId: "seed-sun-moon-lake",
    attractionName: "日月潭國家風景區",
    county: "南投縣",
    category: "Toilets",
    facilityName: "無障礙廁所",
    description: "向山遊客中心與水社遊客中心均設有無障礙廁所。",
  },
  {
    attractionId: "seed-sun-moon-lake",
    attractionName: "日月潭國家風景區",
    county: "南投縣",
    category: "InformationCenters",
    facilityName: "向山遊客中心服務台",
    description: "提供輪椅借用與環湖步道無障礙動線諮詢。",
  },
  {
    attractionId: "seed-alishan",
    attractionName: "阿里山國家森林遊樂區",
    county: "嘉義縣",
    category: "Toilets",
    facilityName: "無障礙廁所",
    description: "森林遊樂區入口與沼平車站周邊設有無障礙廁所。",
  },
  {
    attractionId: "seed-taroko",
    attractionName: "太魯閣國家公園",
    county: "花蓮縣",
    category: "InformationCenters",
    facilityName: "太魯閣遊客中心服務台",
    description: "提供輪椅、老花眼鏡借用與無障礙步道地圖諮詢。",
  },
  {
    attractionId: "seed-maokong",
    attractionName: "貓空纜車",
    county: "臺北市",
    category: "ChargingServices",
    facilityName: "行動電源租借站",
    description: "貓空纜車動物園站設有行動電源租借服務。",
  },
  {
    attractionId: "seed-kenting",
    attractionName: "墾丁國家公園",
    county: "屏東縣",
    category: "Toilets",
    facilityName: "無障礙廁所",
    description: "墾丁遊客中心與沙灘周邊設有無障礙廁所與淋浴設施。",
  },
];

export const SENIOR_TOURISM_SERVICES_SEED: Array<{
  attractionId: string;
  attractionName: string;
  county: string;
  serviceName: string;
  description: string | null;
  serviceUrl: string | null;
}> = [
  {
    attractionId: "seed-sun-moon-lake",
    attractionName: "日月潭國家風景區",
    county: "南投縣",
    serviceName: "輪椅借用服務",
    description: "向山遊客中心提供免費輪椅借用（數量有限，建議先電話洽詢）。",
    serviceUrl: "https://www.sunmoonlake.gov.tw",
  },
  {
    attractionId: "seed-taroko",
    attractionName: "太魯閣國家公園",
    county: "花蓮縣",
    serviceName: "語音導覽服務",
    description: "遊客中心提供多語言語音導覽裝置借用服務。",
    serviceUrl: "https://www.taroko.gov.tw",
  },
  {
    attractionId: "seed-kenting",
    attractionName: "墾丁國家公園",
    county: "屏東縣",
    serviceName: "老花眼鏡借用服務",
    description: "遊客中心服務台提供老花眼鏡免費借用。",
    serviceUrl: "https://www.ktnp.gov.tw",
  },
];

export const SENIOR_TOUR_PACKAGES_SEED: Array<{
  packageName: string;
  description: string | null;
  bookingUrl: string | null;
  pictureUrl: string | null;
  issuingEntity: string;
}> = [
  {
    packageName: "樂齡輕旅行推薦行程",
    description: "交通部觀光署彙整全臺適合長輩的無障礙友善景點與慢遊行程建議。",
    bookingUrl: "https://www.taiwan.net.tw",
    pictureUrl: null,
    issuingEntity: "交通部觀光署",
  },
  {
    packageName: "部落樂齡文化體驗遊程",
    description: "結合原住民部落導覽與平緩步道的樂齡友善遊程資訊。",
    bookingUrl: "https://www.taiwan.net.tw",
    pictureUrl: null,
    issuingEntity: "交通部觀光署",
  },
];
