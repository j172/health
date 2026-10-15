import { z } from "zod";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeHost } from "@/lib/server/antiFraud/checkSuspiciousUrl";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import type { FraudDomainRecord } from "@/lib/server/antiFraud/sources/police176455";

// 數位發展部（數產署）「詐騙網域停止解析清單」— data.gov.tw dataset 165027 —
// see issue #567 / #562. Updates almost daily (vs. 176455's monthly batch),
// filling the gap between 176455's publishing cycles. Confirmed live
// 2026-10-14: HTTP 200, JSON array, 1,734 rows, latest 停止解析日期
// 2026-10-08. Columns: 編號、一頁式數位經濟詐騙網站、偽冒網址、網域名稱、
// 詐騙網站創建日期、接獲通報日期、停止解析日期.
//
// Unlike 176455, this source has NO 網站性質-style classification column —
// only the free-text 一頁式數位經濟詐騙網站 column describing what the site
// impersonates (e.g. "連至PChome 24H購物網站首頁"). That text is carried
// through as `fraudDescription`, never forced into `siteNature` (issue #567
// is explicit this must not be done — a classification field and a
// free-text description are not interchangeable).
const SOURCE_URL = "https://www-api.moda.gov.tw/OpenData/Files/16352";

export const MODA_165027_SOURCE_KEY = "moda_165027";

interface Moda165027Raw {
  編號: string;
  一頁式數位經濟詐騙網站: string;
  偽冒網址: string;
  網域名稱: string;
  詐騙網站創建日期: string;
  接獲通報日期: string;
  停止解析日期: string;
}

/**
 * Critical-field schema: 網域名稱 is the only field this ingestion's
 * identity (the `fraud_domains.domain` unique-key component) depends on —
 * same convention as `police176455RawSchema` (see that file's doc comment).
 * Typed `.nullable()` so an upstream rename/removal of the column fails
 * loudly, while a single row's legitimately blank value still passes.
 */
export const moda165027RawSchema = z.object({
  網域名稱: z.string().nullable(),
});

/**
 * Parses the 165027 JSON array into structured records, normalizing each
 * row's 網域名稱 the exact same way `checkSuspiciousUrl` normalizes a
 * user's pasted URL — see `parsePolice176455Csv`'s doc comment for why the
 * two sides have to agree on one canonical spelling. A row whose 網域名稱
 * doesn't normalize to a real-looking host is dropped rather than failing
 * the whole import (confirmed live: 0/1,734 real rows hit this path, but a
 * future upstream data-quality blip shouldn't be able to fail the entire
 * daily sync over one bad row).
 */
export function parseModa165027Json(payload: unknown): FraudDomainRecord[] {
  if (!Array.isArray(payload)) {
    throw new Error(
      `數產署 165027 詐騙網域停止解析清單 schema validation failed: expected a JSON array from the upstream response, got ${typeof payload}. The upstream API shape may have changed.`,
    );
  }
  const rows = payload as unknown as Moda165027Raw[];
  validateImportRows("數產署 165027 詐騙網域停止解析清單", moda165027RawSchema, rows);

  const records: FraudDomainRecord[] = [];
  for (const row of rows) {
    const domain = normalizeHost(row.網域名稱);
    if (!domain) continue;
    records.push({
      domain,
      source: MODA_165027_SOURCE_KEY,
      siteNature: null,
      legalBasis: null,
      applicantOrg: null,
      // 停止解析日期 is already YYYYMMDD (e.g. "20261008") — stored as-is,
      // same column 176455 uses for its own differently-shaped 民國年月
      // string; the UI tells the two shapes apart by digit count.
      reportedYearMonth: row.停止解析日期?.trim() || null,
      fraudDescription: row.一頁式數位經濟詐騙網站?.trim() || null,
    });
  }
  return records;
}

export async function fetchModa165027FraudDomains(): Promise<FraudDomainRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL, { timeoutMs: 60_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`MODA 165027 fraud-domains request failed: HTTP ${status}`);
  }
  return parseModa165027Json(JSON.parse(text));
}
