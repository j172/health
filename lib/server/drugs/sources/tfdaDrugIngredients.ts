import AdmZip from "adm-zip";
import type { DrugIngredientRecord } from "@/lib/server/drugs/ingredientsQueries";
import { httpRequest } from "@/lib/server/net/httpClient";

// 衛福部食藥署藥品成分資料集（ZIP 包裝的 JSON）— one row per (license × ingredient).
// https://data.fda.gov.tw/data/opendata/export/43/json
const SOURCE_URL = "https://data.fda.gov.tw/data/opendata/export/43/json";

interface TfdaIngredientRaw {
  許可證字號: string;
  處方標示: string | null;
  成分名稱: string;
  成分代碼: string | null;
  含量描述: string | null;
  含量: string | null;
  含量單位: string | null;
}

const nullify = (s: string | null | undefined): string | null => (s && s.trim() ? s.trim() : null);

export async function fetchTfdaDrugIngredients(): Promise<DrugIngredientRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, buffer } = await httpRequest(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`TFDA drug ingredients request failed: HTTP ${status}`);

  // The endpoint serves a ZIP archive containing a single JSON file, not JSON directly.
  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find((e) => e.entryName.endsWith(".json"));
  if (!entry) throw new Error("TFDA drug ingredients ZIP contained no .json entry");

  const raw: TfdaIngredientRaw[] = JSON.parse(entry.getData().toString("utf-8"));

  return raw
    .filter((item) => item.許可證字號 && item.成分名稱)
    .map((item) => ({
      licenseNo: item.許可證字號,
      prescriptionLabel: nullify(item.處方標示),
      ingredientName: item.成分名稱,
      ingredientCode: nullify(item.成分代碼),
      contentDescription: nullify(item.含量描述),
      contentAmount: nullify(item.含量),
      contentUnit: nullify(item.含量單位),
    }));
}
