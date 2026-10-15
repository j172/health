import { z } from "zod";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import { normalizeHost } from "@/lib/server/antiFraud/checkSuspiciousUrl";

// 內政部警政署「165反詐騙諮詢專線_遭停止解析涉詐網站」
// data.gov.tw dataset 176455 — see issue #564 / #562. ~93,840 rows, ~10MB,
// UTF-8 with BOM, updated roughly monthly. Columns: 民國年月,網域,網站性質,
// 法律依據,聲請單位 (confirmed live 2026-10-14).
const SOURCE_URL =
  "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/29E8E643-88ED-4952-B21E-BD42A3B7108C/resource/81B3145B-8134-4B01-9FAE-1D62638B4E78/download";

export const POLICE_176455_SOURCE_KEY = "police_176455";

interface Police176455Raw {
  民國年月: string;
  網域: string;
  網站性質: string;
  法律依據: string;
  聲請單位: string;
}

/**
 * Critical-field schema for the raw CSV rows. 網域 is the only field this
 * ingestion's identity (the `fraud_domains.domain` unique-key component)
 * depends on, so it's the only one validated here — same convention as
 * `molOccupationalInjuryRawSchema` (see that file's doc comment): typed
 * `.nullable()` so a column renamed/removed upstream fails loudly (a row
 * where the column is simply absent gets `undefined`, which `.nullable()`
 * rejects), while a single row's legitimately blank value still passes.
 */
export const police176455RawSchema = z.object({
  網域: z.string().nullable(),
});

/**
 * Shared record shape for every `fraud_domains` ingestion source (176455,
 * and — issue #567 — 165027/160055 too). Not 176455-specific despite living
 * in this file; kept here rather than split into its own module to avoid
 * churning every existing import of it (queries.ts, runSync.ts) for a pure
 * rename.
 */
export interface FraudDomainRecord {
  /** Already run through `normalizeHost` — lower-cased, punycode, no port/trailing dot. */
  domain: string;
  source: string;
  /** 網站性質 (176455 only). 165027/160055 have no such classification — null, not a borrowed/forced value. */
  siteNature: string | null;
  /** 法律依據 (176455 only). */
  legalBasis: string | null;
  /** 聲請單位 (176455 only). */
  applicantOrg: string | null;
  /**
   * A single display string for "when", in one of two shapes depending on
   * source: 176455's raw 民國年月 (e.g. "11509"), or an 8-digit Gregorian
   * YYYYMMDD date (165027's 停止解析日期, 160055's 統計結束日期 normalized
   * from "YYYY/MM/DD"). Not part of any key — see schema.ts's fraudDomains
   * comment. The UI (AntiFraudChecker.tsx's formatReportedYearMonth)
   * distinguishes the two shapes by digit count.
   */
  reportedYearMonth: string | null;
  /**
   * Free-text description of what the domain impersonates/is, for a source
   * that has no 網站性質-style classification: 165027's 一頁式數位經濟詐騙
   * 網站 column, or 160055's 網站名稱 column. Deliberately a separate field
   * from `siteNature` rather than stuffed into it — see issue #567: "不要
   * 硬塞進 siteNature 欄位冒充分類". Null for 176455, which has real
   * site-nature classification instead.
   */
  fraudDescription: string | null;
}

/**
 * Parses the 176455 CSV text into structured records, normalizing each
 * row's 網域 the exact same way `checkSuspiciousUrl` normalizes a user's
 * pasted URL — the two have to agree on one canonical spelling per domain
 * or an exact-match DB lookup will never hit. A row whose 網域 doesn't
 * normalize to a real-looking host (blank, malformed) is dropped rather
 * than failing the whole import — real-world government CSVs occasionally
 * carry a handful of blank/garbage cells, and losing one row of ~93,840 to
 * that is a better failure mode than losing the entire month's sync.
 */
export function parsePolice176455Csv(csvText: string): FraudDomainRecord[] {
  const rows = parseCsv(csvText) as unknown as Police176455Raw[];
  validateImportRows("警政署 176455 遭停止解析涉詐網站", police176455RawSchema, rows);

  const records: FraudDomainRecord[] = [];
  for (const row of rows) {
    const domain = normalizeHost(row.網域);
    if (!domain) continue;
    records.push({
      domain,
      source: POLICE_176455_SOURCE_KEY,
      siteNature: row.網站性質?.trim() || null,
      legalBasis: row.法律依據?.trim() || null,
      applicantOrg: row.聲請單位?.trim() || null,
      reportedYearMonth: row.民國年月?.trim() || null,
      fraudDescription: null,
    });
  }
  return records;
}

export async function fetchPolice176455FraudDomains(): Promise<FraudDomainRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts. The
  // response is ~10MB, well inside httpGetText's default 24MB cap.
  const { status, text } = await httpGetText(SOURCE_URL, { timeoutMs: 60_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`Police 176455 fraud-domains request failed: HTTP ${status}`);
  }
  return parsePolice176455Csv(text);
}
