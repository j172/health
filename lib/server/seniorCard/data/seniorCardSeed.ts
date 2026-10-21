import { TAIWAN_COUNTIES } from "@/lib/constants/taiwanDistricts";

/**
 * /tools/senior-friendly（敬老卡補助）的靜態種子資料 — issue #729。
 *
 * 敬老卡補助已改為「靜態資料」：不再有排程同步，只在 senior_card_subsidies 表為空時
 * 由 ensureSeniorCardSeeded()（見 ../queries.ts）灌入這份種子；表裡已有資料
 * （先前 TDX 同步寫入的真實列，或管理員手動更新後的列）時一律以資料表為準，不會被覆蓋。
 * 需要更新時由管理員手動呼叫 POST /api/admin/senior-card-sync（runSeniorCardSync）。
 *
 * SENIOR_CARD_SUBSIDIES_SEED 涵蓋 22 縣市。各縣市補助額度與資格細節會隨時間調整，
 * 所以每列刻意只寫出普遍成立的資格規則，並導向全國一致、不會過期的轉介管道
 * （衛福部 1957 福利諮詢專線），而不是猜測可能失效的縣市專屬深層連結。
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
