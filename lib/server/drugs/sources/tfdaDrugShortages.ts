import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { z } from "zod";
import { httpRequest } from "@/lib/server/net/httpClient";
import { validateImportRows } from "@/lib/server/validation/importSchema";

// 衛福部食藥署「藥品短缺」兩份資料集 (issue #670 / spec docs/2.0/track-b-opendata-phase2-3-spec.md A-2):
//   - 54504 經評估有替代藥品品項資料集  → data.fda.gov.tw export/104
//   - 54505 經評估無替代藥品品項資料集  → data.fda.gov.tw export/105
// 兩份欄位完全相同：編號、公告更新時間、中文品名（中文＋換行＋英文）、許可證字號、供應狀態。
//
// 54505 在 2026-10-15 實測是「空檔」：只有一列
//   {"編號":"沒有資料","公告更新時間":null,"中文品名":null,"許可證字號":null,"供應狀態":null}
// 這是上游表示「目前沒有品項」的慣例，不是錯誤——解析器要認得它並回傳空陣列。
// 日後若真的有資料，格式與 54504 相同。
//
// 主機：data.fda.gov.tw 已被上線中的 drugs 工具（tfdaDrugAppearance／tfdaDrugIngredients）
// 使用，視為可達；兩檔合計約 200 KB，沒有記憶體風險。

export type DrugShortageSourceKey = "tfda_drug_shortage_54504" | "tfda_drug_shortage_54505";

export interface DrugShortageSource {
  /** drug_shortages.source_key (VARCHAR(40)). */
  sourceKey: DrugShortageSourceKey;
  /** data.gov.tw dataset id, for logs and attribution. */
  datasetId: "54504" | "54505";
  url: string;
  /** 54504 = 經評估有替代藥品 (true); 54505 = 經評估無替代藥品 (false). */
  hasAlternative: boolean;
  label: string;
}

export const DRUG_SHORTAGE_SOURCES: readonly DrugShortageSource[] = [
  {
    sourceKey: "tfda_drug_shortage_54504",
    datasetId: "54504",
    url: "https://data.fda.gov.tw/data/opendata/export/104/json",
    hasAlternative: true,
    label: "經評估有替代藥品",
  },
  {
    sourceKey: "tfda_drug_shortage_54505",
    datasetId: "54505",
    url: "https://data.fda.gov.tw/data/opendata/export/105/json",
    hasAlternative: false,
    label: "經評估無替代藥品",
  },
];

export interface DrugShortageRecord {
  sourceKey: DrugShortageSourceKey;
  /** SHA-256 over (source, license, name, status text, occurrence) — see buildRowKey. */
  rowKey: string;
  hasAlternative: boolean;
  /** "" when the upstream row has no license number (the notice is still worth showing). */
  licenseNo: string;
  nameZh: string;
  nameEn: string | null;
  /** "YYYY-MM-DD" from 公告更新時間, or null if missing/implausible. */
  announcedOn: string | null;
  supplyStatus: string | null;
}

// Critical-field schema: the two identity fields everything downstream keys
// on. `.nullable()` (not `.optional()`) so a column renamed/removed upstream
// fails loudly while one row's legitimately null value (the 54505
// placeholder row has nulls everywhere) still passes — see
// lib/server/validation/importSchema.ts.
export const tfdaDrugShortageRawSchema = z.object({
  許可證字號: z.string().nullable(),
  中文品名: z.string().nullable(),
});

interface TfdaDrugShortageRaw {
  編號?: string | null;
  公告更新時間?: string | null;
  中文品名: string | null;
  許可證字號: string | null;
  供應狀態?: string | null;
}

const NO_DATA_MARKER = "沒有資料";

/**
 * True when the payload is exactly the upstream's "no items" placeholder —
 * every row's 編號 is "沒有資料". Distinguishes a deliberately empty list
 * (54505 today) from an empty/garbled response, which is an anomaly.
 */
export function isNoDataPlaceholder(raw: unknown): boolean {
  return (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((row) => typeof row === "object" && row !== null && String((row as TfdaDrugShortageRaw).編號 ?? "").trim() === NO_DATA_MARKER)
  );
}

const nullify = (s: string | null | undefined): string | null => {
  const trimmed = typeof s === "string" ? s.replace(/\r\n?/g, "\n").trim() : "";
  return trimmed ? trimmed : null;
};

/**
 * 中文品名 is "<中文名>\n<English name>" on every row seen live (238/238).
 * First line → nameZh, the remaining lines joined → nameEn. A single-line
 * value is kept whole as nameZh.
 */
export function splitProductName(raw: string | null | undefined): { nameZh: string; nameEn: string | null } {
  const lines = (raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const [nameZh = "", ...rest] = lines;
  return { nameZh, nameEn: rest.length > 0 ? rest.join(" ") : null };
}

const MIN_PLAUSIBLE_YEAR = 1990;

/**
 * "2026/10/07" → "2026-10-07". Returns null (never throws) for anything that
 * isn't a real calendar date in a plausible range — upstream open data in
 * this family has placeholder years (1911) and typos (2819).
 */
export function toIsoDate(raw: string | null | undefined, now: Date = new Date()): string | null {
  if (!raw) return null;
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_PLAUSIBLE_YEAR || year > now.getUTCFullYear() + 1) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Row identity. The upstream has no usable key: 編號 is a 1..N sequence
 * regenerated on export, and 許可證字號 repeats (236 distinct licenses over
 * 238 rows — e.g. two Taxol notices for 衛署藥輸字第021157號). So the key is a
 * hash of the identifying *content* — dataset, license, name, status wording —
 * plus an occurrence counter that separates fully identical rows.
 *
 * Deliberately NOT part of the key: 編號 (unstable) and 公告更新時間 (a time
 * column — a re-announcement of unchanged wording should UPDATE the row, not
 * insert a new one). An edited notice gets a new key; the old row is removed
 * by the weekly snapshot reconcile, so the table cannot accumulate.
 */
const buildRowKey = (
  sourceKey: DrugShortageSourceKey,
  licenseNo: string,
  nameZh: string,
  nameEn: string | null,
  supplyStatus: string | null,
  occurrence: number,
): string =>
  createHash("sha256")
    .update([sourceKey, licenseNo, nameZh, nameEn ?? "", supplyStatus ?? "", String(occurrence)].join("\u0001"))
    .digest("hex");

/**
 * Pure parser: decoded JSON → records. Throws on a non-array payload or a
 * renamed identity field; returns [] for the "沒有資料" placeholder.
 */
export function parseDrugShortages(raw: unknown, source: DrugShortageSource, now: Date = new Date()): DrugShortageRecord[] {
  validateImportRows(`TFDA drug shortage ${source.datasetId}`, tfdaDrugShortageRawSchema, raw);
  if (isNoDataPlaceholder(raw)) return [];

  const occurrences = new Map<string, number>();
  const records: DrugShortageRecord[] = [];

  for (const item of raw as TfdaDrugShortageRaw[]) {
    const licenseNo = nullify(item.許可證字號) ?? "";
    const { nameZh, nameEn } = splitProductName(item.中文品名);
    if (!licenseNo && !nameZh) continue;

    const supplyStatus = nullify(item.供應狀態);
    const identity = [licenseNo, nameZh, nameEn ?? "", supplyStatus ?? ""].join("\u0001");
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);

    records.push({
      sourceKey: source.sourceKey,
      rowKey: buildRowKey(source.sourceKey, licenseNo, nameZh, nameEn, supplyStatus, occurrence),
      hasAlternative: source.hasAlternative,
      licenseNo,
      nameZh,
      nameEn,
      announcedOn: toIsoDate(item.公告更新時間, now),
      supplyStatus,
    });
  }

  return records;
}

/**
 * The same data.fda.gov.tw export URL pattern serves a ZIP-wrapped JSON for
 * some datasets (export/42, /43) and plain JSON for others (this one, today),
 * and has been seen to switch. Sniff the "PK" magic bytes rather than trusting
 * the URL. Also strips a UTF-8 BOM.
 */
export function bufferToJsonText(buffer: Buffer): string {
  let bytes = buffer;
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const entry = new AdmZip(buffer).getEntries().find((e) => e.entryName.toLowerCase().endsWith(".json"));
    if (!entry) throw new Error("TFDA drug shortage ZIP contained no .json entry");
    bytes = entry.getData();
  }
  return bytes.toString("utf-8").replace(/^﻿/, "");
}

export interface DrugShortageFetchResult {
  source: DrugShortageSource;
  records: DrugShortageRecord[];
  /** The upstream explicitly said "沒有資料" (as opposed to returning nothing). */
  noDataPlaceholder: boolean;
}

export async function fetchDrugShortages(source: DrugShortageSource): Promise<DrugShortageFetchResult> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, buffer } = await httpRequest(source.url, { timeoutMs: 30_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`TFDA drug shortage ${source.datasetId} request failed: HTTP ${status}`);
  }

  const raw: unknown = JSON.parse(bufferToJsonText(buffer));
  return {
    source,
    records: parseDrugShortages(raw, source),
    noDataPlaceholder: isNoDataPlaceholder(raw),
  };
}
