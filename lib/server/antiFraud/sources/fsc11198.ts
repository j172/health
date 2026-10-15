import { z } from "zod";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";

// 金融監督管理委員會「打詐儀表板」data.gov.tw dataset 11198 — weekly rollup of
// 違規投資廣告 case counts (not per-domain either): how many new cases were
// opened this week, the week-over-week change percentage, and the running
// cumulative total.
//
// Host note (issue #570's PR description covers this in full): this is
// www.sfb.gov.tw (證期局, a bureau under 金管會), a DIFFERENT host from
// 176455/172159's opdadm.moi.gov.tw (內政部). A direct curl from this dev
// sandbox got an F5-style "Request Rejected" 503 on every attempt (same WAF
// signature documented elsewhere in this repo for other datacenter-IP-
// blocked government hosts), while fetching the same URL through a
// different egress path succeeded and returned plain CSV. Neither host has
// been confirmed reachable from the actual production host yet — that's
// the orchestrator's job per #562's "新上游第一步是從正式主機實測" rule,
// same as every other new source in this ticket.
//
// Filename note: despite the URL's filename embedding what looks like a
// fixed generation timestamp (`202412161656230.csv` = 2024-12-16 16:56:23),
// this is NOT a frozen one-time snapshot — re-fetching it returned 97 rows
// running from 2024-12-06 all the way through 2026-10-12 (three days before
// this ticket's "today", 2026-10-15), i.e. it keeps growing a new row every
// week under the exact same URL/filename. The filename is just a stable
// stale-looking name for what is in fact a live, continuously-appended
// export — don't "fix" this URL later assuming it's dead.
const SOURCE_URL =
  "https://www.sfb.gov.tw/uploaddowndoc?file=opendata/202412161656230.csv&filedisplay=金管會打詐儀表板.csv&flag=doc";

export const FSC_11198_SOURCE_KEY = "fsc_11198";

// The real header's third column is literally `較前期增減%` — a `%` is not a
// valid TS object-property identifier character, so rows are typed as a
// plain `Record<string, string>` below and that column is read via bracket
// notation instead of a named interface field.

/**
 * Critical-field schema: 日期 is the only field this ingestion's identity
 * (the fsc_fraud_ad_stats.report_date unique key) depends on.
 */
export const fsc11198RawSchema = z.object({
  日期: z.string().nullable(),
});

export interface FscFraudAdStatsRecord {
  /** "YYYY-MM-DD", converted from the source's "YYYYMMDD". */
  reportDate: string;
  weeklyNewCount: number | null;
  changePct: number | null;
  cumulativeCount: number | null;
}

/**
 * Some rows format 累計案件數 with thousands commas once the running total
 * passes 100,000 (confirmed live: 2026-09-29's row is literally `"117,768"`,
 * quoted so the comma survives parseCsv's splitting) — same
 * `.replace(/,/g, "")` convention as police172159.ts's parseIntLoose /
 * lib/server/power/fetchGenerationMix.ts's parseNum.
 */
function parseNumLoose(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Converts the source's compact "YYYYMMDD" 日期 (e.g. "20241206") into a
 * plain "YYYY-MM-DD" DATE-column string. Returns null for anything that
 * doesn't match that exact 8-digit shape — same "drop the row rather than
 * fail the whole sync" posture as every other source parser in this file's
 * sibling modules.
 */
function parseYyyymmdd(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  return `${y}-${m}-${d}`;
}

/**
 * Parses the 11198 CSV text into structured weekly records. The header's
 * third column (較前期增減%) is read via bracket notation since `%` can't be
 * written as a bare TS property key — see the note above `FscFraudAdStatsRecord`.
 */
export function parseFsc11198Csv(csvText: string): FscFraudAdStatsRecord[] {
  const rows = parseCsv(csvText) as unknown as Record<string, string>[];
  validateImportRows("金管會 11198 打詐儀表板", fsc11198RawSchema, rows);

  const records: FscFraudAdStatsRecord[] = [];
  for (const row of rows) {
    const reportDate = parseYyyymmdd(row["日期"]);
    if (!reportDate) continue;
    records.push({
      reportDate,
      weeklyNewCount: parseNumLoose(row["本週新增件數"]),
      changePct: parseNumLoose(row["較前期增減%"]),
      cumulativeCount: parseNumLoose(row["累計案件數"]),
    });
  }
  return records;
}

export async function fetchFsc11198Stats(): Promise<FscFraudAdStatsRecord[]> {
  const { status, text } = await httpGetText(SOURCE_URL, { timeoutMs: 30_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`FSC 11198 fraud-ad-stats request failed: HTTP ${status}`);
  }
  return parseFsc11198Csv(text);
}
