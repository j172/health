import AdmZip from "adm-zip";
import { z } from "zod";
import type { DrugRecord } from "@/lib/server/drugs/queries";
import { httpRequest } from "@/lib/server/net/httpClient";
import { validateImportRows } from "@/lib/server/validation/importSchema";

// 衛福部食藥署藥品許可證與外觀資料集（ZIP 包裝的 JSON）
// https://data.fda.gov.tw/data/opendata/export/42/json
const SOURCE_URL = "https://data.fda.gov.tw/data/opendata/export/42/json";

interface TfdaDrugRaw {
  許可證字號: string;
  中文品名: string;
  英文品名: string | null;
  形狀: string | null;
  特殊劑型: string | null;
  顏色: string | null;
  特殊氣味: string | null;
  刻痕: string | null;
  外觀尺寸: string | null;
  標註一: string | null;
  標註二: string | null;
  外觀圖檔連結: string | null;
}

// Critical-field schema for the raw rows. This is the same data.fda.gov.tw
// TFDA drug-data family whose thin/incomplete field coverage is documented
// in docs/specs/drug-label-source-blocked.md (the drug package-insert
// feature was blocked precisely because TFDA's structured exports don't
// carry the fields that would be needed) — the exact class of "upstream
// dataset doesn't have the field you assumed it did" risk this validation
// guards against. `許可證字號`/`中文品名` are the identity fields the
// `.filter()` below and downstream `upsertDrugs()` keying depend on.
// `.nullable()` (not `.optional()`) so a field entirely absent from every
// row (renamed/removed upstream) fails loudly, while one row's legitimately
// empty value still passes.
export const tfdaDrugAppearanceRawSchema = z.object({
  許可證字號: z.string().nullable(),
  中文品名: z.string().nullable(),
});

const nullify = (s: string | null | undefined): string | null => (s && s.trim() ? s.trim() : null);

export async function fetchTfdaDrugAppearance(): Promise<DrugRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, buffer } = await httpRequest(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`TFDA drug appearance request failed: HTTP ${status}`);

  // The endpoint serves a ZIP archive containing a single JSON file, not JSON directly.
  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find((e) => e.entryName.endsWith(".json"));
  if (!entry) throw new Error("TFDA drug appearance ZIP contained no .json entry");

  const raw: TfdaDrugRaw[] = JSON.parse(entry.getData().toString("utf-8"));
  validateImportRows("TFDA drug appearance", tfdaDrugAppearanceRawSchema, raw);

  return raw
    .filter((item) => item.許可證字號 && item.中文品名)
    .map((item) => ({
      sourceKey: "tfda_drug_appearance",
      licenseNo: item.許可證字號,
      nameZh: item.中文品名,
      nameEn: nullify(item.英文品名),
      shape: nullify(item.形狀),
      dosageForm: nullify(item.特殊劑型),
      color: nullify(item.顏色),
      odor: nullify(item.特殊氣味),
      scoreMark: nullify(item.刻痕),
      sizeMm: nullify(item.外觀尺寸),
      imprint1: nullify(item.標註一),
      imprint2: nullify(item.標註二),
      imageUrl: nullify(item.外觀圖檔連結),
    }));
}
