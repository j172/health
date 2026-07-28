import AdmZip from "adm-zip";
import type { DrugRecord } from "@/lib/server/drugs/queries";
import { httpRequest } from "@/lib/server/net/httpClient";

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
