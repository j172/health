/**
 * Shared types for the hand-maintained `data/ltc-benefits.json` and
 * `data/ltc-3-0-updates.json` (issue #615, parent spec #611). Neither file
 * goes through the facility-sync pipeline — both are read directly by
 * `app/(zh)/tools/ltc-benefits/page.tsx`, the same pattern
 * `data/child-subsidies.json` → `ChildSubsidiesContent` (issue #604)
 * already uses.
 *
 * Every number in `data/ltc-benefits.json` comes from 《長期照顧服務申請及
 * 給付辦法》附表二（長照需要等級及長照服務給付項目之額度）、附表三（交通
 * 接送服務給付分區表）與附表五（部分負擔比率）— verified 2026-10-15
 * directly from the regulation's own schedule PDFs (see each section's
 * `officialUrl`/`legalBasis` in the data file, not just a news summary).
 */

import type { SourcedFact, WelfareStatus } from "@/lib/server/subsidies/types";

export type { WelfareStatus };

/** 長照需要等級：第一級（未失能）不納入給付範圍，故給付對象為第 2–8 級。 */
export type LtcNeedLevel = 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const LTC_NEED_LEVELS: readonly LtcNeedLevel[] = [2, 3, 4, 5, 6, 7, 8];

/**
 * The estimator's level input also accepts "not yet assessed" — issue
 * #615 explicitly asks for this as a first-class option (most visitors
 * researching this page haven't had their 照專到府評估 yet), not an error
 * state.
 */
export type LtcNeedLevelSelection = LtcNeedLevel | "not-assessed";

/**
 * 交通接送服務給付分區（附表三）。Region assignment is by 縣市幅員 (land
 * area) for most of Taiwan, plus a named-list override for 偏遠縣市 and 48
 * 偏遠鄉鎮市區 (both folded into 第四區). `data/ltc-benefits.json`'s
 * `transport.regionExamples` gives a handful of representative counties
 * per region for the UI; it is NOT the exhaustive legal list — that's
 * 附表三 itself (see `transport.legalBasis`/`officialUrl`).
 */
export type LtcTransportRegion = "region1" | "region2" | "region3" | "region4";

export const LTC_TRANSPORT_REGIONS: readonly LtcTransportRegion[] = [
  "region1",
  "region2",
  "region3",
  "region4",
];

/** 照顧及專業服務（適用 B、C 碼）月給付額度，依長照需要等級 2–8 定之。 */
export interface LtcCareServiceSchedule extends SourcedFact {
  monthlyAmountByLevel: Record<LtcNeedLevel, number>;
}

/** 交通接送服務（適用 D 碼）月給付額度，依分區（附表三）定之，各等級相同額度。 */
export interface LtcTransportSchedule extends SourcedFact {
  monthlyAmountByRegion: Record<LtcTransportRegion, number>;
  regionExamples: Record<LtcTransportRegion, string>;
}

/**
 * 輔具及居家無障礙環境改善服務（適用 E、F 碼）三年給付額度，各等級相同額
 * 度。第二組自 115 年 7 月 1 日施行，與第一組擇一申請；其中居家無障礙環境
 * 改善服務於三年期間另以 2 萬元為限（`homeModificationCapWithinGroupTwo`）。
 */
export interface LtcAssistiveDeviceSchedule extends SourcedFact {
  triennialAmount: {
    groupOne: number;
    groupTwo: number;
  };
  homeModificationCapWithinGroupTwo: number;
  groupTwoEffectiveDate: string;
}

/** 家庭照顧者支持服務之喘息服務（適用 G 碼）年給付額度，依長照需要等級分兩段。 */
export interface LtcRespiteSchedule extends SourcedFact {
  annualAmountByLevel: Record<LtcNeedLevel, number>;
}

/** 單一服務項目對三種福利身分的部分負擔比率（0–100，單位：%）。 */
export interface LtcCopayPercentByStatus {
  general: number;
  midLowIncome: number;
  lowIncome: number;
}

/**
 * 部分負擔比率（附表五），依第14條分「長照第一類／第二類／第三類」訂
 * 定。此型別只暴露三種福利身分（一般戶／中低收入戶／低收入戶）—
 * `note` 欄位明文記載這個簡化：低收入戶與列冊中低收入戶在辦法上同屬「第
 * 一類」（比率皆為 0%），「第二類」（中低收入老人生活津貼第5條第1項第2
 * 款或身心障礙者生活補助資格者，比率 5–10%）是本頁未單獨呈現的第四種情
 * 形，不是遺漏或猜測。
 */
export interface LtcCopayRatesSchedule extends SourcedFact {
  careService: LtcCopayPercentByStatus;
  transportByRegion: Record<LtcTransportRegion, LtcCopayPercentByStatus>;
  assistiveDevice: LtcCopayPercentByStatus;
  respite: LtcCopayPercentByStatus;
}

/** The full shape of `data/ltc-benefits.json`. */
export interface LtcBenefitsSchedule {
  careService: LtcCareServiceSchedule;
  transport: LtcTransportSchedule;
  assistiveDevice: LtcAssistiveDeviceSchedule;
  respite: LtcRespiteSchedule;
  copayRates: LtcCopayRatesSchedule;
}

/**
 * One 長照3.0 change, either already in effect or still being phased in.
 * Deliberately one shared shape with an `inEffect: boolean` flag (unlike
 * child-subsidies' two separate files/arrays) because every 長照3.0 item
 * here shares the same fields (`title`/`summary`/`officialUrl`); only
 * `effectiveDate` differs in meaning (a real past/confirmed date vs. a
 * forward-looking, intentionally vague description for "規劃中" items —
 * see `Ltc3PlanItem.summary`'s neutral-framing requirement below).
 */
export interface Ltc3PlanItem extends SourcedFact {
  id: string;
  title: string;
  /**
   * `inEffect: true` items must have a concrete ISO 8601 `effectiveDate`
   * (verified against an official announcement). `inEffect: false`
   * ("規劃中") items may have `effectiveDate: null` when the official
   * source itself doesn't commit to one — the summary text must stay
   * neutral either way ("中性文字呈現，不評論時程"), never speculate on
   * Claude's own behalf about when something will actually roll out.
   */
  inEffect: boolean;
  effectiveDate: string | null;
  summary: string;
}
