import { z } from "zod";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv } from "@/lib/server/facilities/csv";
import { normalizeHost } from "@/lib/server/antiFraud/checkSuspiciousUrl";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import type { FraudDomainRecord } from "@/lib/server/antiFraud/sources/police176455";

// 內政部警政署「假投資（博弈）網站」— data.gov.tw dataset 160055 — see issue
// #567 / #562. ONE-TIME HISTORICAL IMPORT ONLY — do not add a cron job for
// this source. The dataset's own metadata says it stopped updating after
// 2025-12-31 because its scope was folded into the broader 176455 list, so
// there is no "latest batch" to keep polling for; POST /api/admin/police-160055-import
// runs this exactly once, by hand, after deploy (the former standalone script
// was removed 2026-10-21). Confirmed live 2026-10-14: HTTP 200, CSV,
// UTF-8 with BOM, ~45,258 rows. Columns: 網站名稱,網址,件數,統計起始日期,
// 統計結束日期.
//
// Like 165027, this source has no 網站性質-style classification — 網站名稱
// (the gambling/fake-investment site's own display name, e.g. "0857娛樂城")
// is carried through as `fraudDescription`, not forced into `siteNature`.
const SOURCE_URL =
  "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/033197D4-70F4-45EB-9FB8-6D83532B999A/resource/A00B1802-6A4A-42B4-B842-B66A2D937DAE/download";

export const POLICE_160055_SOURCE_KEY = "police_160055";

interface Police160055Raw {
  網站名稱: string;
  網址: string;
  件數: string;
  統計起始日期: string;
  統計結束日期: string;
}

/**
 * Critical-field schema: 網址 is the only field this ingestion's identity
 * (the `fraud_domains.domain` unique-key component, after `normalizeHost`)
 * depends on — same convention as `police176455RawSchema`. Typed
 * `.nullable()` so an upstream rename/removal fails loudly, while a single
 * row's legitimately blank value still passes.
 */
export const police160055RawSchema = z.object({
  網址: z.string().nullable(),
});

/** "2025/08/21" -> "20250821". Returns null for anything that doesn't match that exact shape rather than guessing. */
function toYyyymmdd(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(trimmed);
  if (!match) return null;
  return `${match[1]}${match[2]}${match[3]}`;
}

/**
 * Parses the 160055 CSV text into structured records. 網址 here is NOT a
 * clean bare domain the way 176455's 網域 and 165027's 網域名稱 are — real
 * rows carry a bare host ("www.0857.games"), a host+path
 * ("ebyss.jwmvcuay.com/vvqqgku0"), or a full scheme+port+path URL
 * ("https://dl.nzs127jn.com:19865/khoaRg7w") — so every row goes through
 * the exact same `normalizeHost` `checkSuspiciousUrl` uses on a user's
 * pasted input, not a bare trim. A row whose 網址 doesn't normalize to a
 * real-looking host (a bare IP literal, a single-label garbage string) is
 * dropped rather than failing the whole import — confirmed live: 9 of
 * 45,258 real rows hit this path, none of them a usable domain anyway.
 *
 * Multiple rows can normalize to the same domain (the same site reported
 * across different date ranges) — each is still pushed through as its own
 * record rather than pre-deduped here; `upsertFraudDomains`'s (domain,
 * source) unique key already collapses them during the upsert itself (last
 * row processed for a given domain wins), so a second pass here would just
 * duplicate that work for no behavioral difference.
 */
export function parsePolice160055Csv(csvText: string): FraudDomainRecord[] {
  const rows = parseCsv(csvText) as unknown as Police160055Raw[];
  validateImportRows("警政署 160055 假投資（博弈）網站", police160055RawSchema, rows);

  const records: FraudDomainRecord[] = [];
  for (const row of rows) {
    const domain = normalizeHost(row.網址);
    if (!domain) continue;
    records.push({
      domain,
      source: POLICE_160055_SOURCE_KEY,
      siteNature: null,
      legalBasis: null,
      applicantOrg: null,
      // 統計結束日期 normalized from "YYYY/MM/DD" to "YYYYMMDD" — same
      // 8-digit shape 165027 stores here, so the UI's digit-count-based
      // format detection (AntiFraudChecker.tsx) covers both uniformly.
      reportedYearMonth: toYyyymmdd(row.統計結束日期),
      fraudDescription: row.網站名稱?.trim() || null,
    });
  }
  return records;
}

/**
 * Fetches the full 160055 CSV. Exported for the one-time import (POST /api/admin/police-160055-import) — there is no `runSync.ts` entry for this
 * source and no cron job calls this; see the module doc comment above.
 */
export async function fetchPolice160055FraudDomains(): Promise<FraudDomainRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts. The
  // response is ~2.3MB, well inside httpGetText's default 24MB cap.
  const { status, text } = await httpGetText(SOURCE_URL, { timeoutMs: 60_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`Police 160055 fraud-domains request failed: HTTP ${status}`);
  }
  return parsePolice160055Csv(text);
}
