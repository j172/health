import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";

// data.gov.tw 133345「美沙冬跨區給藥服務機構」(臺北市立聯合醫院上架，內容是全國
// 可跨區給藥的美沙冬院所名單)——2026-10-14 實測 65 筆。CSV，UTF-8（無 BOM）。給藥
// 時段欄位內含真正的換行字元（例如 "07:30-08:30\n12:30-20:00"），但欄位本身有用
// 雙引號正確括住，是合法的 CSV 內嵌換行——lib/server/facilities/csv.ts 的
// parseCsv() 本來就是整串字元流解析（不是先用 split("\n") 切行），所以這裡不需要
// 額外處理。沒有座標，交給既有 geocode 批次處理，和其他地址來源的資料來源一致。
const SOURCE_URL =
  "https://data.taipei/api/dataset/2e4dcb8a-af96-4170-a5dc-32b5dc7e9247/resource/dc82ccb5-1138-4c91-b948-56f53ab3d243/download";

interface MethadoneCrossDistrictRawRow {
  機構名稱: string;
  機構地址: string;
  聯絡電話: string;
  分機: string;
  平日給藥時間: string;
  假日給藥時間: string;
  其他給藥時間: string;
  轉入掛號費: string;
  跨區給藥服務費: string;
  轉出掛號費: string;
  跨區給藥評估費: string;
  注意事項: string;
}

// Critical-field schema for the raw rows (see addictionTreatmentFacilities.ts
// for the incident this pattern guards against — an upstream column rename
// landing silently). 機構名稱/機構地址 are identity-bearing (sourceId and
// geocoding both depend on them); the three dosing-time fields and the four
// fee fields are what this ticket (#571) exists to surface on the 成癮防治
// 分頁's 跨區給藥 tab, so a silent upstream rename of any of them should fail
// loudly too, not just silently stop appearing on the card.
export const methadoneCrossDistrictRawSchema = z.object({
  機構名稱: z.string().nullable(),
  機構地址: z.string().nullable(),
  聯絡電話: z.string().nullable(),
  平日給藥時間: z.string().nullable(),
  假日給藥時間: z.string().nullable(),
  其他給藥時間: z.string().nullable(),
  轉入掛號費: z.string().nullable(),
  跨區給藥服務費: z.string().nullable(),
  轉出掛號費: z.string().nullable(),
  跨區給藥評估費: z.string().nullable(),
});

/**
 * Collapses a raw multi-line field (dosing-time windows, or the free-text
 * 注意事項 notes — both can contain real embedded newlines in the source CSV,
 * confirmed live 2026-10-14, e.g. "07:30-08:30\n12:30-20:00") into one
 * readable line for the card UI's single-line `extraFields` display (see
 * FacilitySearchContent.tsx) — joining with "、" rather than relying on CSS
 * white-space handling to preserve the breaks. Trims each segment so a
 * trailing space before the newline (also present in real rows, e.g.
 * "07:30-08:30 \n12:30-20:00") doesn't leave a stray double space.
 */
export function joinMultilineField(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const segments = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return segments.length > 0 ? segments.join("、") : null;
}

export function buildMethadoneCrossDistrictSourceId(name: string, address?: string | null): string {
  return `${name.trim()}|${(address || "").trim()}`.slice(0, 100);
}

export async function fetchMethadoneCrossDistrict(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`Methadone cross-district dosing facilities (133345) request failed: HTTP ${status}`);

  const raw = parseCsv(text) as unknown as MethadoneCrossDistrictRawRow[];
  validateImportRows("Methadone cross-district dosing facilities (133345)", methadoneCrossDistrictRawSchema, raw);

  return raw
    .filter((r) => r.機構名稱 && r.機構地址)
    .map((r) => {
      const address = normalizeAddress(r.機構地址);
      return {
        facilityType: "methadone_cross_district",
        sourceKey: "methadone_cross_district_133345",
        sourceId: buildMethadoneCrossDistrictSourceId(r.機構名稱, address),
        name: r.機構名稱,
        address,
        // Same `市話 + 分機` composition as molOccupationalInjuryHospital.ts /
        // molHealthCheckFacility.ts.
        phone: r.聯絡電話
          ? toHalfwidthDigits(r.聯絡電話) + (r.分機 ? ` 分機${toHalfwidthDigits(r.分機)}` : "")
          : null,
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: "衛生福利部（data.gov.tw 133345，臺北市立聯合醫院上架）",
        extra: {
          methadoneWeekdayDosingTime: joinMultilineField(r.平日給藥時間),
          methadoneHolidayDosingTime: joinMultilineField(r.假日給藥時間),
          methadoneOtherDosingTime: joinMultilineField(r.其他給藥時間),
          methadoneTransferInFee: r.轉入掛號費 || null,
          methadoneCrossDistrictFee: r.跨區給藥服務費 || null,
          methadoneTransferOutFee: r.轉出掛號費 || null,
          methadoneEvaluationFee: r.跨區給藥評估費 || null,
          methadoneNotes: joinMultilineField(r.注意事項),
        },
      };
    });
}
