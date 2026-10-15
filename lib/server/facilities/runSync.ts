import { upsertFacilities, type FacilityRecord } from "@/lib/server/facilities/queries";
import { fetchTfdaPharmacies } from "@/lib/server/facilities/sources/tfdaPharmacies";
import { fetchMolHealthCheckFacilities } from "@/lib/server/facilities/sources/molHealthCheckFacility";
import { fetchMolOccupationalInjuryHospitals } from "@/lib/server/facilities/sources/molOccupationalInjuryHospital";
import { fetchNhiHospitals } from "@/lib/server/facilities/sources/nhiHospitals";
import { fetchNhiPharmacies } from "@/lib/server/facilities/sources/nhiPharmacies";
import { fetchNhiHomeHealthcare } from "@/lib/server/facilities/sources/nhiHomeHealthcare";
import { fetchHakkaCommunity } from "@/lib/server/facilities/sources/hakkaCommunity";
import { fetchMoenvGreenHotels } from "@/lib/server/facilities/sources/moenvGreenHotels";
import { fetchNhiPenalties } from "@/lib/server/facilities/sources/nhiPenalties";
import { fetchTdxAudibleSignals } from "@/lib/server/facilities/sources/tdxAudibleSignals";
import { fetchTdxAccessibleParking } from "@/lib/server/facilities/sources/tdxParking";
import { fetchAddictionTreatmentFacilities } from "@/lib/server/facilities/sources/addictionTreatmentFacilities";
import {
  fetchTaipeiChildcarePrivate,
  fetchTaipeiChildcarePublicPrivate,
  fetchTaipeiChildcareQuasi,
  fetchTaipeiChildcareCommunity,
  fetchTaipeiChildcareHomeCenter,
} from "@/lib/server/facilities/sources/taipeiChildcare";
import {
  fetchNtpcChildcarePrivate,
  fetchNtpcChildcarePublic,
  fetchNtpcChildcareHomeCenter,
} from "@/lib/server/facilities/sources/ntpcChildcare";
import { fetchTycgChildcarePublicPrivate, fetchTycgChildcareQuasi } from "@/lib/server/facilities/sources/tycgChildcare";
import { fetchTaichungChildcare } from "@/lib/server/facilities/sources/taichungChildcare";
import { fetchTainanChildcare } from "@/lib/server/facilities/sources/tainanChildcare";
import {
  fetchKaohsiungChildcarePrivate,
  fetchKaohsiungChildcarePublicPrivate,
} from "@/lib/server/facilities/sources/kaohsiungChildcare";
import { runSource } from "@/lib/server/sync/runSource";

export interface FacilitySyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

const ZERO_COUNTS = { fetched: 0, inserted: 0, updated: 0 };

// Registry of facility sources — add one entry per source as they're wired up
// (drugs, health-checks, etc.), each behind its own fetch function.
const SOURCES: { key: string; fetch: () => Promise<FacilityRecord[]> }[] = [
  { key: "tfda_pharmacy", fetch: fetchTfdaPharmacies },
  { key: "mol_labor_checkup", fetch: fetchMolHealthCheckFacilities },
  { key: "mol_occupational_injury", fetch: fetchMolOccupationalInjuryHospitals },
  { key: "nhi_hospital", fetch: fetchNhiHospitals },
  { key: "nhi_pharmacy", fetch: fetchNhiPharmacies },
  { key: "nhi_home_healthcare", fetch: fetchNhiHomeHealthcare },
  { key: "hakka_dtst20230600002", fetch: fetchHakkaCommunity },
  { key: "moenv_green_hotel", fetch: fetchMoenvGreenHotels },
  { key: "nhi_penalty", fetch: fetchNhiPenalties },
  // #468: nationwide 盲人有聲號誌 points from TDX's "basic" category. Its own
  // fetch isolates per-county failures internally (see tdxAudibleSignals.ts);
  // runSource() below still wraps it so a total failure (e.g. no TDX
  // credentials configured) reports as this one source's error without
  // touching any other source's result.
  { key: "tdx_aps", fetch: fetchTdxAudibleSignals },
  // #469: nationwide 孕婦及親子／身心障礙汽車／身心障礙機車／復康巴士 special
  // parking spaces from TDX's "basic" 停車資訊 service, filtered down to only
  // those 4 SpaceType values inside tdxParking.ts itself. Same per-county (and
  // per off-street/on-street kind) failure isolation as tdx_aps above.
  { key: "tdx_parking", fetch: fetchTdxAccessibleParking },
  // #566: 心理健康地圖「成癮防治」分頁的主線資料——全國藥癮戒治/替代治療/非鴉片類
  // 藥癮治療補助機構（data.gov.tw 133353）。No coordinates of its own, geocoded via
  // the usual facilities-geocode backfill like every other address-only source here.
  // The download URL (data.taipei) hasn't been verified reachable from the production
  // host yet — see the comment above fetchAddictionTreatmentFacilities() — confirm that
  // before relying on this source's scheduled runs.
  { key: "addiction_treatment_133353", fetch: fetchAddictionTreatmentFacilities },
  // #601 (parent #599): 托嬰中心與居家托育地圖，臺北＋新北骨架。5 個臺北來源
  // registered individually — taipei_childcare_121278 (私立) internally
  // re-fetches taipei_childcare_121981 (準公共) to dedupe the two tables'
  // known overlap (see taipeiChildcare.ts's module comment); the other 4
  // sources here are unaffected by that and can each be backfilled alone.
  { key: "taipei_childcare_121278", fetch: fetchTaipeiChildcarePrivate },
  { key: "taipei_childcare_121337", fetch: fetchTaipeiChildcarePublicPrivate },
  { key: "taipei_childcare_121981", fetch: fetchTaipeiChildcareQuasi },
  { key: "taipei_childcare_126984", fetch: fetchTaipeiChildcareCommunity },
  { key: "taipei_childcare_126986", fetch: fetchTaipeiChildcareHomeCenter },
  // 新北市的 3 個來源互相獨立，沒有臺北那種跨表重疊問題（見 ntpcChildcare.ts）。
  { key: "ntpc_childcare_125380", fetch: fetchNtpcChildcarePrivate },
  { key: "ntpc_childcare_126222", fetch: fetchNtpcChildcarePublic },
  { key: "ntpc_childcare_125505", fetch: fetchNtpcChildcareHomeCenter },
  // #606 (parent #599): 六都剩餘四縣市——桃園／臺中／臺南／高雄。桃園
  // tycg_childcare_168379 同樣內部重抓 168385 做私立/準公共去重（見
  // tycgChildcare.ts 模組註解），其餘 3 個來源互相獨立。
  { key: "tycg_childcare_168379", fetch: fetchTycgChildcarePublicPrivate },
  { key: "tycg_childcare_168385", fetch: fetchTycgChildcareQuasi },
  { key: "taichung_childcare_83669", fetch: fetchTaichungChildcare },
  { key: "tainan_childcare_6178", fetch: fetchTainanChildcare },
  { key: "kcg_childcare_128099", fetch: fetchKaohsiungChildcarePrivate },
  { key: "kcg_childcare_128100", fetch: fetchKaohsiungChildcarePublicPrivate },
];

// mohw_disability_welfare and mohw_elder_welfare are NOT registered here —
// opendata.mohw.gov.tw is a mohw.gov.tw subdomain, the same apex domain as
// ltcpap.mohw.gov.tw (confirmed unreachable from this host and GitHub
// Actions runners); a facilities-sync run attempting them came back with
// zero rows, and running the equivalent fetch from a residential network
// (scripts/import-mohw-disability-welfare.mjs, scripts/import-mohw-elder-
// welfare.mjs) succeeded immediately, confirming the same IP-range block
// rather than a code bug. Run those two scripts by hand instead.

export const FACILITY_SOURCE_KEYS: readonly string[] = SOURCES.map((s) => s.key);

/**
 * `only` limits the run to those source keys — e.g. backfilling a newly
 * added source without re-fetching every other one (tens of thousands of
 * rows) on the memory-capped host. Omitted = every source, as before.
 */
export async function runFacilitySync(only?: readonly string[]): Promise<FacilitySyncResult[]> {
  const results: FacilitySyncResult[] = [];
  const selected = only?.length ? SOURCES.filter((s) => only.includes(s.key)) : SOURCES;

  for (const source of selected) {
    results.push(
      await runSource(source.key, ZERO_COUNTS, async () => {
        const records = await source.fetch();
        const { inserted, updated } = await upsertFacilities(records);
        return { fetched: records.length, inserted, updated };
      }),
    );
  }

  return results;
}
