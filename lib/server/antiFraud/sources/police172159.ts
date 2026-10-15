import { z } from "zod";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";

// 內政部警政署「打詐儀錶板打擊詐欺成效」data.gov.tw dataset 172159 — monthly
// national rollup (not per-domain) of interdiction results: how many fraud
// gangs/members were caught, how much illicit proceeds were seized, and how
// much money was blocked before it reached a scammer. Confirmed live
// 2026-10-14/15: 24 rows, 113年9月–115年8月, UTF-8 with BOM, same
// opdadm.moi.gov.tw host as 176455 (lib/server/antiFraud/sources/
// police176455.ts) — reachable directly from this dev sandbox over plain
// curl, so (unlike 11198 below) there's no reason to expect it to be
// datacenter-IP-blocked on the production host either, though that's still
// unconfirmed from the actual production host itself (see issue #570's PR
// description for what "confirmed" means here).
const SOURCE_URL =
  "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/7F7EEF1C-0946-4A09-87E5-EC34C14C3A80/resource/FDAC2241-6794-457A-84D5-7B29118E8446/download";

export const POLICE_172159_SOURCE_KEY = "police_172159";

interface Police172159Raw {
  年度: string;
  月: string;
  查緝不法犯罪集團團數: string;
  查緝不法犯罪集團人數: string;
  查扣不法所得金額: string;
  攔阻金額: string;
}

/**
 * Critical-field schema: 年度/月 are the only fields this ingestion's
 * identity (the police_fraud_interdiction_stats.(roc_year, roc_month)
 * unique-key) depends on — same convention as police176455RawSchema's
 * doc comment explains for 網域.
 */
export const police172159RawSchema = z.object({
  年度: z.string().nullable(),
  月: z.string().nullable(),
});

export interface PoliceFraudInterdictionRecord {
  rocYear: number;
  rocMonth: number;
  gangCount: number | null;
  memberCount: number | null;
  seizedAmountNtd: number | null;
  blockedAmountNtd: number | null;
}

/**
 * Some of this source's numeric columns are thousands-comma-formatted when
 * the value is large (confirmed live: 114年10月's 查緝不法犯罪集團人數 row is
 * literally `"3,666"` — quoted so the comma survives parseCsv's splitting —
 * see this file's fixture). Same inline `.replace(/,/g, "")` convention as
 * lib/server/power/fetchGenerationMix.ts's parseNum.
 */
function parseIntLoose(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Parses the 172159 CSV text into structured monthly records. A row whose
 * 年度 or 月 doesn't parse to a real integer is dropped (same "lose one bad
 * row rather than the whole month's sync" philosophy as
 * parsePolice176455Csv) — this source is tiny (24 rows today) so losing one
 * to a malformed cell is cheap, and far better than crashing the whole sync.
 */
export function parsePolice172159Csv(csvText: string): PoliceFraudInterdictionRecord[] {
  const rows = parseCsv(csvText) as unknown as Police172159Raw[];
  validateImportRows("警政署 172159 打詐儀錶板打擊詐欺成效", police172159RawSchema, rows);

  const records: PoliceFraudInterdictionRecord[] = [];
  for (const row of rows) {
    const rocYear = parseIntLoose(row.年度);
    const rocMonth = parseIntLoose(row.月);
    if (rocYear === null || rocMonth === null) continue;
    records.push({
      rocYear,
      rocMonth,
      gangCount: parseIntLoose(row.查緝不法犯罪集團團數),
      memberCount: parseIntLoose(row.查緝不法犯罪集團人數),
      seizedAmountNtd: parseIntLoose(row.查扣不法所得金額),
      blockedAmountNtd: parseIntLoose(row.攔阻金額),
    });
  }
  return records;
}

export async function fetchPolice172159Stats(): Promise<PoliceFraudInterdictionRecord[]> {
  const { status, text } = await httpGetText(SOURCE_URL, { timeoutMs: 30_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`Police 172159 fraud-interdiction-stats request failed: HTTP ${status}`);
  }
  return parsePolice172159Csv(text);
}
