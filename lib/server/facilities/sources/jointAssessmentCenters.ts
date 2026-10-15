import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, normalizeUnitName, parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import { buildEarlyInterventionSourceId } from "@/lib/server/facilities/sources/earlyInterventionUnits";

/**
 * 縣市兒童發展聯合評估中心／評估鑑定醫院補充來源（issue #613） — 4 independent,
 * independently-rerunnable sources (臺北 135454、新北 125231／123786、高雄
 * 128165), each supplementing the national 130229 early-intervention-unit
 * dataset with the 聯合評估中心 a parent would use for a FORMAL developmental
 * assessment (vs. 130229's actual 療育 service providers). All four share
 * `facilityType: "early_intervention_unit"` and `serviceItem: "聯合評估中心"`
 * (so they participate in the same 單位別 category filter as the national
 * rows) but keep their own `sourceKey` so any one of them can be re-synced
 * on its own via `runFacilitySync(["taipei_joint_assessment_135454"])` etc.
 * without touching the other three or the (much larger) national source.
 */

const SERVICE_ITEM = "聯合評估中心";

// ---------------------------------------------------------------------------
// 臺北市 — data.gov.tw 135454「臺北市政府早期療育聯合評估中心暨評估鑑定醫院」
// ---------------------------------------------------------------------------

const TAIPEI_SOURCE_URL = "https://data.taipei/api/dataset/78a0c167-efe7-4695-9e02-4777248fac1f/resource/29d226e5-35e0-46bf-8a7b-3e929941a459/download";

interface TaipeiJointAssessmentRaw {
  序號: string;
  機構類型: string;
  機構名稱: string;
  地址: string;
  電話: string;
}

export const taipeiJointAssessmentRawSchema = z.object({
  機構名稱: z.string().nullable(),
  地址: z.string().nullable(),
});

export async function fetchTaipeiJointAssessmentCenters(): Promise<FacilityRecord[]> {
  const { status, text } = await httpGetText(TAIPEI_SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`Taipei joint-assessment centers (135454) request failed: HTTP ${status}`);

  const raw = parseCsv(text) as unknown as TaipeiJointAssessmentRaw[];
  validateImportRows("Taipei joint-assessment centers (135454)", taipeiJointAssessmentRawSchema, raw);

  return raw
    .filter((r) => r.機構名稱 && r.地址)
    .map((r) => {
      const name = normalizeUnitName(r.機構名稱);
      const address = normalizeAddress(r.地址);
      return {
        facilityType: "early_intervention_unit",
        sourceKey: "taipei_joint_assessment_135454",
        sourceId: buildEarlyInterventionSourceId("臺北市", name, address),
        name,
        address,
        phone: r.電話 ? toHalfwidthDigits(r.電話) : null,
        lat: null,
        lng: null,
        serviceItem: SERVICE_ITEM,
        serviceTime: null,
        dataOrg: "臺北市政府（data.taipei 135454）",
        extra: { centerType: r.機構類型 || null },
      };
    });
}

// ---------------------------------------------------------------------------
// 新北市 — data.gov.tw 125231「新北市政府衛生局合作早期療育評估鑑定醫院」
// ---------------------------------------------------------------------------

const NTPC_HEALTH_SOURCE_URL = "https://data.ntpc.gov.tw/api/datasets/d200c1fe-6019-481b-ab20-566009648b19/csv/file";

interface NtpcHealthJointAssessmentRaw {
  no: string;
  title: string;
  localcallservice: string;
  extension: string;
  area: string;
  address: string;
  evaluate_method: string;
  note: string;
}

export const ntpcHealthJointAssessmentRawSchema = z.object({
  title: z.string().nullable(),
  area: z.string().nullable(),
  address: z.string().nullable(),
});

export async function fetchNtpcHealthJointAssessmentCenters(): Promise<FacilityRecord[]> {
  const { status, text } = await httpGetText(NTPC_HEALTH_SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`New Taipei health-bureau joint-assessment hospitals (125231) request failed: HTTP ${status}`);

  const raw = parseCsv(text) as unknown as NtpcHealthJointAssessmentRaw[];
  validateImportRows("New Taipei health-bureau joint-assessment hospitals (125231)", ntpcHealthJointAssessmentRawSchema, raw);

  return raw
    .filter((r) => r.title && r.address)
    .map((r) => {
      const name = normalizeUnitName(r.title);
      // 新北市's own address column omits the county+district prefix
      // (confirmed live — e.g. "南雅南路2段21號" under area "板橋區"); unlike
      // 130229's dataset this one never already carries it, so this always
      // prepends rather than checking first.
      const address = normalizeAddress(`新北市${r.area || ""}${r.address}`);
      const phone = r.localcallservice ? toHalfwidthDigits(r.localcallservice) + (r.extension ? ` 分機${toHalfwidthDigits(r.extension)}` : "") : null;
      return {
        facilityType: "early_intervention_unit",
        sourceKey: "ntpc_joint_assessment_125231",
        sourceId: buildEarlyInterventionSourceId("新北市", name, address),
        name,
        address,
        phone,
        lat: null,
        lng: null,
        serviceItem: SERVICE_ITEM,
        serviceTime: null,
        dataOrg: "新北市政府衛生局（data.ntpc.gov.tw 125231）",
        extra: { note: [r.evaluate_method, r.note].filter((s) => s && s.trim()).join("；") || null },
      };
    });
}

// ---------------------------------------------------------------------------
// 新北市 — data.gov.tw 123786「新北市發展遲緩兒童評估鑑定醫院」
// ---------------------------------------------------------------------------

const NTPC_DEV_DELAY_SOURCE_URL = "https://data.ntpc.gov.tw/api/datasets/8254a8e7-c454-49b7-a600-e25a17a5d130/csv/file";

interface NtpcDevDelayJointAssessmentRaw {
  seqno: string;
  hosp_name: string;
  hosp_addr: string;
  tel: string;
  remark: string;
}

export const ntpcDevDelayJointAssessmentRawSchema = z.object({
  hosp_name: z.string().nullable(),
  hosp_addr: z.string().nullable(),
});

export async function fetchNtpcDevDelayJointAssessmentCenters(): Promise<FacilityRecord[]> {
  const { status, text } = await httpGetText(NTPC_DEV_DELAY_SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`New Taipei developmental-delay assessment hospitals (123786) request failed: HTTP ${status}`);

  const raw = parseCsv(text) as unknown as NtpcDevDelayJointAssessmentRaw[];
  validateImportRows("New Taipei developmental-delay assessment hospitals (123786)", ntpcDevDelayJointAssessmentRawSchema, raw);

  return raw
    .filter((r) => r.hosp_name && r.hosp_addr)
    .map((r) => {
      const name = normalizeUnitName(r.hosp_name);
      const address = normalizeAddress(r.hosp_addr);
      // "NIL" is this dataset's literal placeholder for "no remark" (confirmed
      // live on every one of the 29 real rows) — not a real note to display.
      const note = r.remark && r.remark.trim().toUpperCase() !== "NIL" ? r.remark.trim() : null;
      return {
        facilityType: "early_intervention_unit",
        sourceKey: "ntpc_joint_assessment_123786",
        sourceId: buildEarlyInterventionSourceId("新北市", name, address),
        name,
        address,
        phone: r.tel ? toHalfwidthDigits(r.tel) : null,
        lat: null,
        lng: null,
        serviceItem: SERVICE_ITEM,
        serviceTime: null,
        dataOrg: "新北市政府（data.ntpc.gov.tw 123786）",
        extra: { note },
      };
    });
}

// ---------------------------------------------------------------------------
// 高雄市 — data.gov.tw 128165「早期療育服務-兒童發展聯合評估中心與評估醫院」
// ---------------------------------------------------------------------------
// Unlike the other 3 county sources (and the national 130229 dataset), this
// one already carries its own lat/lng (confirmed live — every real row has
// both) — no geocode-batch entry needed for this sourceKey.

const KHH_SOURCE_URL = "https://data.kcg.gov.tw/File/DirectDownload/155f9255-a0f1-4aee-9bc5-70ac1483b95f";

interface KhhJointAssessmentRaw {
  id: string;
  lat: string;
  lng: string;
  informaddress: string;
  informtel: string;
  servItem: string;
  dataOrg: string;
  doOrg: string;
  text: string;
}

export const khhJointAssessmentRawSchema = z.object({
  text: z.string().nullable(),
  informaddress: z.string().nullable(),
  lat: z.string().nullable(),
  lng: z.string().nullable(),
});

export async function fetchKhhJointAssessmentCenters(): Promise<FacilityRecord[]> {
  const { status, text } = await httpGetText(KHH_SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`Kaohsiung joint-assessment centers (128165) request failed: HTTP ${status}`);

  const raw = parseCsv(text) as unknown as KhhJointAssessmentRaw[];
  validateImportRows("Kaohsiung joint-assessment centers (128165)", khhJointAssessmentRawSchema, raw);

  return raw
    .filter((r) => r.text && r.informaddress)
    .map((r) => {
      const name = normalizeUnitName(r.text);
      const address = normalizeAddress(r.informaddress);
      const lat = r.lat ? Number(r.lat) : null;
      const lng = r.lng ? Number(r.lng) : null;
      return {
        facilityType: "early_intervention_unit",
        sourceKey: "khh_joint_assessment_128165",
        sourceId: buildEarlyInterventionSourceId("高雄市", name, address),
        name,
        address,
        phone: r.informtel ? toHalfwidthDigits(r.informtel) : null,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        serviceItem: SERVICE_ITEM,
        serviceTime: null,
        dataOrg: r.dataOrg ? `${r.dataOrg}（data.kcg.gov.tw 128165）` : "高雄市政府（data.kcg.gov.tw 128165）",
        extra: {
          serviceContent: r.servItem || null,
          department: r.doOrg || null,
        },
      };
    });
}
