import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { z } from "zod";
import { httpRequest } from "@/lib/server/net/httpClient";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import type { BorderFoodRejectionRecord, ParsedBorderRejections } from "@/lib/server/borderFood/types";

// 衛福部食藥署「不符合食品資訊」（邊境查驗不合格食品）— data.gov.tw dataset
// 6133, issue #671 / docs/2.0/track-b-opendata-phase2-3-spec.md §2.1 A-3.
// Verified 2026-10-15 from a developer machine (NOT the production host): plain
// JSON (not the ZIP wrapper some sibling data.fda.gov.tw exports use — the
// parser still sniffs for the PK header rather than trusting the URL), 2,632
// rows, 發布日期 2023/01/03–2026/10/13, upstream refresh every 7 days.
// data.fda.gov.tw is already used by the live `drugs` tool, so it is treated
// as reachable; this specific /export/52 path is first confirmed by the
// post-deploy sync (see the PR's verification TODOs).
const SOURCE_URL = "https://data.fda.gov.tw/data/opendata/export/52/json";

export const BORDER_FOOD_SOURCE_KEY = "fda_6133";

// The file is ~2.8 MB; cap well below the 24 MB default so a hostile or broken
// response can never become resident on the 768 MB-heap production host.
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

// Column widths of border_food_rejections (lib/server/db/schema.ts). Values are
// clipped to these so one unexpectedly long upstream cell cannot fail the whole
// batch under MySQL strict mode.
const MAX_ORIGIN = 64;
const MAX_SUBJECT = 255;
const MAX_REASON = 255;
const MAX_IMPORTER = 500;
const MAX_HS_CODE = 64;
const MAX_MANUFACTURER = 500;
const MAX_BRAND = 255;
const MAX_WEIGHT = 120;
const MAX_DISPOSITION = 255;

/**
 * Critical-field schema: the identity/display fields the parser depends on.
 * `.nullable()` (not `.optional()`) so a column that vanished from every row
 * (renamed upstream) fails loudly while one row's empty value still passes —
 * see lib/server/validation/importSchema.ts.
 */
export const borderRejectionRawSchema = z.object({
  產地: z.string().nullable(),
  主旨: z.string().nullable(),
  原因: z.string().nullable(),
  發布日期: z.string().nullable(),
});

// Upstream columns that feed the row hash, in OUR fixed order (so a reshuffled
// upstream column order never changes a hash). Intentionally absent: 進口商地址
// and 附圖 (issue #671: the page must not carry the importer address or the
// attached image, so they are never read), and 製造商代碼 (an internal code the
// page does not show; excluding it keeps the hash tied to what users can see).
const HASH_FIELDS = [
  "產地",
  "主旨",
  "原因",
  "進口商名稱",
  "貨品分類號列",
  "檢驗方法",
  "不合格原因暨檢出量詳細說明",
  "法規限量標準",
  "製造廠或出口商名稱",
  "牌名",
  "重量",
  "處置情形",
  "發布日期",
  "報驗受理日期",
] as const;

type RawRow = Record<string, unknown>;

/** Single-line text: collapse every whitespace run (incl. full-width spaces) and trim; "" -> null. */
const cleanLine = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned === "" ? null : cleaned;
};

/** Multi-line text (the long detail/limit cells contain real line breaks): keep newlines, tidy the rest. */
const cleanBlock = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned === "" ? null : cleaned;
};

const clip = (value: string | null, max: number): string | null =>
  value !== null && value.length > max ? value.slice(0, max) : value;

const MULTILINE_FIELDS = new Set(["檢驗方法", "不合格原因暨檢出量詳細說明", "法規限量標準"]);
const cleanField = (row: RawRow, field: string): string | null =>
  MULTILINE_FIELDS.has(field) ? cleanBlock(row[field]) : cleanLine(row[field]);

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * "2023/01/03" (also "2024/3/5", "2024-03-05") -> "2023-01-03". Anything that
 * is not a real calendar date, predates 2000 (the 1911 placeholder family) or
 * lies more than a year past `now` (the 2819/2214 typo family seen in sibling
 * FDA datasets) becomes null rather than an exception.
 */
export const parseUpstreamDate = (value: unknown, now: Date): string | null => {
  const text = cleanLine(value);
  if (!text) return null;
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 2000) return null;
  const limit = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()));
  if (date.getTime() > limit.getTime()) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

const hashRow = (row: RawRow): string =>
  createHash("sha256")
    .update(JSON.stringify(HASH_FIELDS.map((field) => [field, cleanField(row, field)])))
    .digest("hex");

const toJsonText = (input: string | Buffer): string => {
  if (typeof input !== "string" && input.length >= 2 && input[0] === 0x50 && input[1] === 0x4b) {
    // "PK" — the data.fda.gov.tw export family sometimes wraps its JSON in a ZIP
    // (6949 does, 6133 currently does not). Detect by header, never by URL.
    const entry = new AdmZip(input).getEntries().find((e) => e.entryName.toLowerCase().endsWith(".json"));
    if (!entry) throw new Error("FDA 6133 ZIP contained no .json entry");
    return entry.getData().toString("utf-8").replace(/^﻿/, "");
  }
  const text = typeof input === "string" ? input : input.toString("utf-8");
  return text.replace(/^﻿/, "");
};

export interface ParseBorderRejectionsOptions {
  /** Injectable clock for the "more than a year in the future" date check. */
  now?: Date;
}

/**
 * Parses the 6133 payload (JSON text, UTF-8 buffer, or ZIP buffer holding one
 * JSON file) into merged records.
 *
 * Merge rule (spec §2.1 A-3 / §6 B-6): the upstream has no primary key, and
 * rows that are identical in every displayed field — they differ only in the
 * attached-image link, which is not shown — are collapsed into one record
 * carrying `duplicateCount`, so nothing is silently lost and the table can use
 * the content hash as its single unique key. On 2026-10-15 that turned 2,632
 * rows into 2,626.
 */
export function parseBorderRejections(
  input: string | Buffer,
  options: ParseBorderRejectionsOptions = {},
): ParsedBorderRejections {
  const now = options.now ?? new Date();

  let raw: unknown;
  try {
    raw = JSON.parse(toJsonText(input));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("FDA 6133 response is not valid JSON (blocked, truncated or HTML error page?)");
    }
    throw error;
  }
  validateImportRows("FDA 6133 border-rejected food", borderRejectionRawSchema, raw);
  const rows = raw as RawRow[];

  const byHash = new Map<string, BorderFoodRejectionRecord>();
  let skippedRowCount = 0;

  for (const row of rows) {
    const originCountry = clip(cleanLine(row["產地"]), MAX_ORIGIN);
    const subject = clip(cleanLine(row["主旨"]), MAX_SUBJECT);
    const reason = clip(cleanLine(row["原因"]), MAX_REASON);
    if (!originCountry || !subject || !reason) {
      skippedRowCount += 1;
      continue;
    }

    const rowHash = hashRow(row);
    const existing = byHash.get(rowHash);
    if (existing) {
      existing.duplicateCount += 1;
      continue;
    }

    byHash.set(rowHash, {
      rowHash,
      originCountry,
      subject,
      reason,
      importerName: clip(cleanLine(row["進口商名稱"]), MAX_IMPORTER),
      hsCode: clip(cleanLine(row["貨品分類號列"]), MAX_HS_CODE),
      inspectionMethod: cleanBlock(row["檢驗方法"]),
      detail: cleanBlock(row["不合格原因暨檢出量詳細說明"]),
      legalLimit: cleanBlock(row["法規限量標準"]),
      manufacturerName: clip(cleanLine(row["製造廠或出口商名稱"]), MAX_MANUFACTURER),
      brandName: clip(cleanLine(row["牌名"]), MAX_BRAND),
      weight: clip(cleanLine(row["重量"]), MAX_WEIGHT),
      disposition: clip(cleanLine(row["處置情形"]), MAX_DISPOSITION),
      publishedOn: parseUpstreamDate(row["發布日期"], now),
      inspectionAcceptedOn: parseUpstreamDate(row["報驗受理日期"], now),
      duplicateCount: 1,
    });
  }

  const records = [...byHash.values()];
  return {
    records,
    rawRowCount: rows.length,
    skippedRowCount,
    mergedDuplicateRows: rows.length - skippedRowCount - records.length,
  };
}

export async function fetchBorderFoodRejections(): Promise<ParsedBorderRejections> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs on
  // this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, buffer } = await httpRequest(SOURCE_URL, {
    timeoutMs: 60_000,
    maxResponseBytes: MAX_RESPONSE_BYTES,
  });
  if (status < 200 || status >= 300) {
    throw new Error(`FDA 6133 border-rejected food request failed: HTTP ${status}`);
  }
  return parseBorderRejections(buffer);
}
