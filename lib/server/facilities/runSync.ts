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
import { fetchNhplatformNursingInstitutions } from "@/lib/server/facilities/sources/nhplatformNursingInstitutions";
import { fetchBabyFriendlyHospitalTaipei } from "@/lib/server/facilities/sources/babyFriendlyHospitalTaipei";
import { fetchBabyFriendlyHospitalNewTaipei } from "@/lib/server/facilities/sources/babyFriendlyHospitalNewTaipei";
import { fetchBabyFriendlyHospitalTaichung } from "@/lib/server/facilities/sources/babyFriendlyHospitalTaichung";
import { fetchBabyFriendlyHospitalTainan } from "@/lib/server/facilities/sources/babyFriendlyHospitalTainan";
import { fetchBabyFriendlyHospitalChanghua } from "@/lib/server/facilities/sources/babyFriendlyHospitalChanghua";
import { fetchHpaSmokingCessationFacilities } from "@/lib/server/facilities/sources/hpaSmokingCessation";
import { fetchMethadoneCrossDistrict } from "@/lib/server/facilities/sources/methadoneCrossDistrict";
import { fetchAntiDrugCenters } from "@/lib/server/facilities/sources/antiDrugCenters";
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
import { fetchHsinchuCityChildcare } from "@/lib/server/facilities/sources/hsinchuCityChildcare";
import { fetchHsinchuCountyChildcare } from "@/lib/server/facilities/sources/hsinchuCountyChildcare";
import { fetchChanghuaChildcare } from "@/lib/server/facilities/sources/changhuaChildcare";
import { fetchChiayiCityChildcare } from "@/lib/server/facilities/sources/chiayiCityChildcare";
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
  // issue #612: 全國開業護理機構清冊 (data.gov.tw 115950) — one CSV fetch that
  // produces records for TWO destinations: facilityType "postpartum_care"
  // (241 rows, the new /tools/postpartum-care) and additional
  // facilityType "long_term_care" rows for 一般護理之家/居家護理所 (merged into
  // the existing /tools/long-term-care as two new category filter values).
  // Self-contained WGS84 coordinates — no geocode backfill needed. Host
  // reachability from the production host is unconfirmed; see the comment
  // above fetchNhplatformNursingInstitutions() and
  // .github/workflows/egress-probe.yml.
  { key: "nhplatform_115950", fetch: fetchNhplatformNursingInstitutions },
  // #614: 母嬰親善醫療院所地圖改用縣市真實資料，取代 build-expansion-seeds.mjs
  // 的 4 筆手寫假資料。5 個縣市各自獨立來源鍵，可分別重跑——高雄（86397）刻意
  // 不接：效期全數落在 2016–2019，已全部過期，不是可用的現行名單。每個來源
  // 自己依該縣市實際的效期欄位格式過濾過期列（臺北/彰化有效期欄位，新北/臺中/
  // 臺南沒有效期欄位可過濾，細節見各檔案開頭註解）。
  { key: "baby_friendly_hospital_taipei_121200", fetch: fetchBabyFriendlyHospitalTaipei },
  { key: "baby_friendly_hospital_new_taipei_123291", fetch: fetchBabyFriendlyHospitalNewTaipei },
  { key: "baby_friendly_hospital_taichung_83649", fetch: fetchBabyFriendlyHospitalTaichung },
  { key: "baby_friendly_hospital_tainan_150985", fetch: fetchBabyFriendlyHospitalTainan },
  { key: "baby_friendly_hospital_changhua_30882", fetch: fetchBabyFriendlyHospitalChanghua },
  // #569 (parent #562): 戒菸院所查詢的全國基底資料——國健署「各縣市合約戒菸醫療
  // 院所」（data.gov.tw 6954），取代 scripts/build-expansion-seeds.mjs 裡原本 6
  // 筆手寫資料。No coordinates of its own, geocoded via the usual facilities-
  // geocode backfill like every other address-only source here. #572 (六都覆蓋,
  // not started yet) will add per-county sources that batch-replace this
  // national source's rows for their own county — this entry's sourceKey
  // ("hpa_smoking_cessation_6954") is scoped to the national dataset only so
  // that replacement can target it without touching a future county source's
  // own rows. The download URL hasn't been verified reachable from the
  // production host yet — see the comment above
  // fetchHpaSmokingCessationFacilities() — confirm that before relying on
  // this source's scheduled runs.
  { key: "hpa_smoking_cessation_6954", fetch: fetchHpaSmokingCessationFacilities },
  // #571 (parent #562): 成癮防治分頁的另外兩類資料——美沙冬跨區給藥院所
  // （data.gov.tw 133345）和 22 縣市毒品危害防制中心（反毒大本營靜態列表頁）。兩者
  // 都沒有座標，一樣交給既有 geocode 批次處理。這兩個來源的下載網址都是從一般住宅
  // 網路實測成功的——和上面 addiction_treatment_133353 一樣，還沒有從正式主機驗證
  // 過，部署前請先確認其中一個能連到。
  { key: "methadone_cross_district_133345", fetch: fetchMethadoneCrossDistrict },
  { key: "anti_drug_center_moj", fetch: fetchAntiDrugCenters },
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
  // #607 (parent #599): 新竹市/新竹縣/彰化/嘉義市托嬰中心來源，補完 #601 骨架的
  // 後續縣市票之一（跟 #606 的六都剩餘四縣市平行進行，互不依賴）。新竹市/彰化兩
  // 縣市的名冊都沒有公辦民營/準公共/私立的分類欄位，category/serviceItem 留
  // null（見各自檔案開頭註解），不是遺漏。新竹縣/彰化兩個來源是 cp950/Big5
  // 編碼；嘉義市自帶經緯度，不需要額外 geocode。reachability（egress-probe
  // runs https://github.com/j172/health/actions/runs/38556225761 和
  // https://github.com/j172/health/actions/runs/38707357085，2026-10-14/15）：
  // email.chcg.gov.tw（彰化）從正式主機、GitHub runner 皆可連線，可安心排程；
  // odws.hccg.gov.tw（新竹市）、ws.hsinchu.gov.tw（新竹縣）從兩邊都連線逾時
  // （不是單純 host IP 被擋——兩邊都連不到，不是能用 runner relay 解決的情況）；
  // data.chiayi.gov.tw（嘉義市）從 GitHub runner 可連線但從正式主機逾時（典型
  // host IP 被擋的情況，但這張票刻意不建 SSH-loopback relay，見
  // chiayiCityChildcare.ts 開頭註解）。部署前請重新確認這三個來源的連線狀況。
  { key: "hccg_childcare_67734", fetch: fetchHsinchuCityChildcare },
  { key: "hsinchu_county_childcare_109321", fetch: fetchHsinchuCountyChildcare },
  { key: "changhua_childcare_95198", fetch: fetchChanghuaChildcare },
  { key: "chiayi_city_childcare_63093", fetch: fetchChiayiCityChildcare },
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
