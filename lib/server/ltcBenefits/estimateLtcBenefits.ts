import type {
  LtcBenefitsSchedule,
  LtcCopayPercentByStatus,
  LtcNeedLevel,
  LtcNeedLevelSelection,
  LtcTransportRegion,
  WelfareStatus,
} from "./types";
import { LTC_TRANSPORT_REGIONS } from "./types";

export interface EstimateLtcBenefitsInput {
  level: LtcNeedLevelSelection;
  welfareStatus: WelfareStatus;
}

interface LtcLineEstimate {
  /** The official monthly/annual/triennial quota for this combination, before copay. */
  amount: number;
  copayPercent: number;
  /** `floor(amount * copayPercent / 100)` — see `floorSelfPay`'s doc comment. */
  selfPay: number;
  /** `amount - selfPay`: what the LTC program actually pays out. */
  govPays: number;
}

export interface LtcCareServiceEstimate extends LtcLineEstimate {
  period: "month";
}

export interface LtcTransportRegionEstimate extends LtcLineEstimate {
  region: LtcTransportRegion;
  regionLabel: string;
  period: "month";
}

export interface LtcAssistiveDeviceEstimate {
  period: "3years";
  groupOne: LtcLineEstimate;
  groupTwo: LtcLineEstimate & { effectiveDate: string };
  homeModificationCapWithinGroupTwo: number;
}

export interface LtcRespiteEstimate extends LtcLineEstimate {
  period: "year";
}

/**
 * Discriminated on `notAssessed` so a caller that checks it first gets the
 * per-service fields narrowed to their non-null type by the compiler,
 * instead of having to `!`-assert past a `| null` on every field.
 */
export type EstimateLtcBenefitsResult =
  | {
      level: "not-assessed";
      welfareStatus: WelfareStatus;
      notAssessed: true;
      careService: null;
      transportByRegion: null;
      assistiveDevice: null;
      respite: null;
    }
  | {
      level: LtcNeedLevel;
      welfareStatus: WelfareStatus;
      notAssessed: false;
      careService: LtcCareServiceEstimate;
      transportByRegion: LtcTransportRegionEstimate[];
      assistiveDevice: LtcAssistiveDeviceEstimate;
      respite: LtcRespiteEstimate;
    };

/**
 * 附表五備註：「部分負擔費用以小數點後無條件捨去計算」— floor, never round
 * or ceil. All inputs here are non-negative, so `Math.floor` is exactly
 * "無條件捨去" (truncate toward zero).
 */
function floorSelfPay(amount: number, copayPercent: number): number {
  return Math.floor((amount * copayPercent) / 100);
}

function buildLineEstimate(amount: number, copayPercent: number): LtcLineEstimate {
  const selfPay = floorSelfPay(amount, copayPercent);
  return { amount, copayPercent, selfPay, govPays: amount - selfPay };
}

function percentFor(rates: LtcCopayPercentByStatus, welfareStatus: WelfareStatus): number {
  return rates[welfareStatus];
}

/**
 * Estimates the four 長照2.0/3.0 benefit items' quota, self-pay amount, and
 * government-paid amount for one 長照需要等級 + 福利身分 combination.
 *
 * Pure and synchronous by design (issue #615's privacy requirement, same as
 * issue #604's `matchChildSubsidies`): takes `schedule` as a parameter
 * instead of fetching it, never logs, and never reads or writes any
 * network or browser-persistence API — called client-side from a
 * `"use client"` component with data the server component already loaded
 * and passed down as props. Nothing the user selects on this page is ever
 * sent over the network or saved anywhere.
 * (lib/server/ltcBenefits/estimateLtcBenefits.test.mjs statically greps
 * this file's source for those APIs via the shared
 * lib/server/subsidies/testSupport.mjs helper, in addition to exercising
 * the estimation logic itself.)
 *
 * `level: "not-assessed"` (issue #615's explicit "還沒評估" option) short
 * circuits to a result with every per-service field `null` — there is no
 * official amount to show for someone without a 長照需要等級 yet, and this
 * function never guesses one.
 *
 * Every numeric figure here is read straight out of `schedule`
 * (`data/ltc-benefits.json`), which cites the specific 附表/條文 and a
 * `lastVerified` date for each section — see that file and
 * `lib/server/ltcBenefits/types.ts`'s doc comments for the citations.
 */
export function estimateLtcBenefits(
  input: EstimateLtcBenefitsInput,
  schedule: LtcBenefitsSchedule,
): EstimateLtcBenefitsResult {
  const { level, welfareStatus } = input;

  if (level === "not-assessed") {
    return {
      level,
      welfareStatus,
      notAssessed: true,
      careService: null,
      transportByRegion: null,
      assistiveDevice: null,
      respite: null,
    };
  }

  const careService: LtcCareServiceEstimate = {
    period: "month",
    ...buildLineEstimate(
      schedule.careService.monthlyAmountByLevel[level],
      percentFor(schedule.copayRates.careService, welfareStatus),
    ),
  };

  const transportByRegion: LtcTransportRegionEstimate[] = LTC_TRANSPORT_REGIONS.map((region) => ({
    region,
    regionLabel: schedule.transport.regionExamples[region],
    period: "month",
    ...buildLineEstimate(
      schedule.transport.monthlyAmountByRegion[region],
      percentFor(schedule.copayRates.transportByRegion[region], welfareStatus),
    ),
  }));

  const devicePercent = percentFor(schedule.copayRates.assistiveDevice, welfareStatus);
  const assistiveDevice: LtcAssistiveDeviceEstimate = {
    period: "3years",
    groupOne: buildLineEstimate(schedule.assistiveDevice.triennialAmount.groupOne, devicePercent),
    groupTwo: {
      ...buildLineEstimate(schedule.assistiveDevice.triennialAmount.groupTwo, devicePercent),
      effectiveDate: schedule.assistiveDevice.groupTwoEffectiveDate,
    },
    homeModificationCapWithinGroupTwo: schedule.assistiveDevice.homeModificationCapWithinGroupTwo,
  };

  const respite: LtcRespiteEstimate = {
    period: "year",
    ...buildLineEstimate(
      schedule.respite.annualAmountByLevel[level],
      percentFor(schedule.copayRates.respite, welfareStatus),
    ),
  };

  return {
    level,
    welfareStatus,
    notAssessed: false,
    careService,
    transportByRegion,
    assistiveDevice,
    respite,
  };
}
