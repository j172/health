import { createHash } from "node:crypto";
import { z } from "zod";
import { httpRequest } from "@/lib/server/net/httpClient";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import { bufferToJsonText, toIsoDate } from "@/lib/server/drugs/sources/tfdaDrugShortages";

// 衛福部食藥署「回收藥品」資料集 (issue #675 / spec docs/2.0/track-b-opendata-phase2-3-spec.md A-2, B-5):
//   - 6947 回收藥品 → data.fda.gov.tw export/34
//
// 2026-10-15 實測：純 JSON（非 ZIP，712 KB），1,713 筆，日期 2008/08/29–2026/08/26，欄位
// 回收分級、文號、日期、產品、許可證字號、批號、許可證持有者、原因。(文號, 許可證字號, 批號)
// 1,713 列皆不重複，但沒有正式主鍵。
//
// 髒資料（都是實測看過的，解析器逐一處理）：
//   - 回收分級 有 14 種寫法：`第二級 `（含尾端空白）、`2`、`第二級`、null（153 筆）、`第一級`、`1`、
//     `3`、`-`、`第三級`、`二`、`疑似第一級`、`第2級`、`3 `、`2 ` → 正規化成 {1,2,3,未載明}。
//   - 許可證字號 有 2 筆是 null；另有「、」或「；」串多張證、`1.… 2.…` 編號串、`衛署藥製字第 044025 號`
//     （號碼內夾空白）、`無(專案輸入藥品)` 這類非證號文字。原文照存，另外抽出標準化證號供與 drugs 表連結。
//   - 文號 161 筆 null、批號 203 筆 null、原因 14 筆 null。
//
// 主機：data.fda.gov.tw 已被上線中的 drugs 工具（tfdaDrugAppearance／tfdaDrugIngredients／
// tfdaDrugShortages）使用，視為可達；單檔 712 KB，沒有記憶體風險。

export interface DrugRecallSource {
  /** Carried on every record, for logs. */
  sourceKey: "tfda_drug_recall_6947";
  /** data.gov.tw dataset id, for logs and attribution. */
  datasetId: "6947";
  url: string;
  label: string;
}

export const DRUG_RECALL_SOURCE: DrugRecallSource = {
  sourceKey: "tfda_drug_recall_6947",
  datasetId: "6947",
  url: "https://data.fda.gov.tw/data/opendata/export/34/json",
  label: "回收藥品",
};

/** The only values `drug_recalls.recall_level` ever holds. */
export const RECALL_LEVELS = ["1", "2", "3", "未載明"] as const;
export type RecallLevel = (typeof RECALL_LEVELS)[number];
export const RECALL_LEVEL_UNSPECIFIED: RecallLevel = "未載明";

const CHINESE_NUMERALS: Record<string, RecallLevel> = { 一: "1", 二: "2", 三: "3" };

/**
 * Upstream 回收分級 → {1,2,3,未載明}. NFKC folds full-width digits, all
 * whitespace is dropped (the live data has trailing spaces), and the accepted
 * spellings are `1`/`第1級`/`一`/`第一級` (and 2, 3), plus `疑似第一級` (the
 * suspected level is kept as that level — the original text is stored next to
 * it so the page can show it). Anything else — blank, `-`, an unknown level —
 * is 未載明: never a guess, never a throw.
 */
export function normalizeRecallLevel(raw: string | null | undefined): RecallLevel {
  const text = (raw ?? "").normalize("NFKC").replace(/\s+/g, "");
  const match = /^(?:疑似)?(?:第)?([123一二三])(?:級)?$/.exec(text);
  if (!match) return RECALL_LEVEL_UNSPECIFIED;
  const digit = match[1];
  return CHINESE_NUMERALS[digit] ?? (digit as RecallLevel);
}

// A drug license number: ≥2 Chinese characters of issuing authority + product
// kind (衛署藥製、內衛成製、衛部菌疫輸 …) + 字第 + 4–8 digits (+ 號, which a few
// live rows drop). 4–8 digits excludes the 10-digit FDA letter numbers that
// appear in 專案進口核備函字號 rows.
const LICENSE_NUMBER_PATTERN = /([一-鿿]{2,12}字第\d{4,8})號?/g;

/**
 * The canonical license numbers (the same `衛署藥製字第040794號` form as
 * drugs.license_no) named by an upstream 許可證字號 cell. Whitespace is
 * removed first (`第 044025 號`), duplicates dropped, order kept. A cell with
 * no license (null, `無(專案輸入藥品)`, a company name) yields [].
 */
export function extractLicenseNumbers(raw: string | null | undefined): string[] {
  const compact = (raw ?? "").replace(/\s+/g, "");
  const found: string[] = [];
  for (const match of compact.matchAll(LICENSE_NUMBER_PATTERN)) {
    const license = `${match[1]}號`;
    if (!found.includes(license)) found.push(license);
  }
  return found;
}

export interface DrugRecallRecord {
  sourceKey: DrugRecallSource["sourceKey"];
  /** SHA-256 over (source, 文號, 許可證字號, 批號, occurrence) — see buildRowKey. */
  rowKey: string;
  docNo: string | null;
  /** "YYYY-MM-DD" from 日期, or null if missing/implausible. */
  recalledOn: string | null;
  productName: string;
  /** The 許可證字號 cell as published (trimmed), which may name several licenses or none. */
  licenseText: string | null;
  /** Canonical license numbers found in licenseText, for joining to drugs. */
  licenseNos: string[];
  holderName: string | null;
  batchNo: string | null;
  reason: string | null;
  /** Normalized to {1,2,3,未載明}. */
  recallLevel: RecallLevel;
  /** The upstream 回收分級 text (trimmed), kept so odd spellings such as `疑似第一級` stay visible. */
  recallLevelRaw: string | null;
}

// Critical-field schema: every column the row key or the level/product logic
// depends on. `.nullable()` (not `.optional()`) so a column renamed/removed
// upstream fails loudly while one row's legitimately null value still passes —
// see lib/server/validation/importSchema.ts.
export const tfdaDrugRecallRawSchema = z.object({
  回收分級: z.string().nullable(),
  文號: z.string().nullable(),
  日期: z.string().nullable(),
  產品: z.string().nullable(),
  許可證字號: z.string().nullable(),
  批號: z.string().nullable(),
});

interface TfdaDrugRecallRaw {
  回收分級: string | null;
  文號: string | null;
  日期: string | null;
  產品: string | null;
  許可證字號: string | null;
  批號: string | null;
  許可證持有者?: string | null;
  原因?: string | null;
}

const nullify = (s: string | null | undefined): string | null => {
  const trimmed = typeof s === "string" ? s.replace(/\r\n?/g, "\n").trim() : "";
  return trimmed ? trimmed : null;
};

/**
 * Row identity: the spec's (文號, 許可證字號, 批號) triple — 1,713 distinct over
 * 1,713 live rows — plus an occurrence counter that separates fully identical
 * rows if one ever appears. Deliberately NOT part of the key: 日期 (a time
 * column), 回收分級 and 原因 (a corrected level or re-worded reason should
 * UPDATE the row, not create a second one).
 */
const buildRowKey = (
  sourceKey: DrugRecallSource["sourceKey"],
  docNo: string | null,
  licenseText: string | null,
  batchNo: string | null,
  occurrence: number,
): string =>
  createHash("sha256")
    .update([sourceKey, docNo ?? "", licenseText ?? "", batchNo ?? "", String(occurrence)].join("\u0001"))
    .digest("hex");

/**
 * Pure parser: decoded JSON → records. Throws on a non-array payload or a
 * renamed critical column; rows with no product name are skipped.
 */
export function parseDrugRecalls(raw: unknown, now: Date = new Date()): DrugRecallRecord[] {
  validateImportRows(`TFDA drug recall ${DRUG_RECALL_SOURCE.datasetId}`, tfdaDrugRecallRawSchema, raw);

  const occurrences = new Map<string, number>();
  const records: DrugRecallRecord[] = [];

  for (const item of raw as TfdaDrugRecallRaw[]) {
    const productName = nullify(item.產品);
    if (!productName) continue;

    const docNo = nullify(item.文號);
    const licenseText = nullify(item.許可證字號);
    const batchNo = nullify(item.批號);

    const identity = [docNo ?? "", licenseText ?? "", batchNo ?? ""].join("\u0001");
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);

    records.push({
      sourceKey: DRUG_RECALL_SOURCE.sourceKey,
      rowKey: buildRowKey(DRUG_RECALL_SOURCE.sourceKey, docNo, licenseText, batchNo, occurrence),
      docNo,
      recalledOn: toIsoDate(item.日期, now),
      productName,
      licenseText,
      licenseNos: extractLicenseNumbers(licenseText),
      holderName: nullify(item.許可證持有者),
      batchNo,
      reason: nullify(item.原因),
      recallLevel: normalizeRecallLevel(item.回收分級),
      recallLevelRaw: nullify(item.回收分級),
    });
  }

  return records;
}

export async function fetchDrugRecalls(): Promise<DrugRecallRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, buffer } = await httpRequest(DRUG_RECALL_SOURCE.url, { timeoutMs: 30_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`TFDA drug recall ${DRUG_RECALL_SOURCE.datasetId} request failed: HTTP ${status}`);
  }
  // bufferToJsonText also copes with the ZIP-wrapped variant this export family
  // sometimes switches to, and strips a BOM.
  return parseDrugRecalls(JSON.parse(bufferToJsonText(buffer)));
}
