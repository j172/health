import type { CwaAlertItem } from "@/lib/server/cwa/queries";

/**
 * Filters an already-fetched `listActiveCwaAlerts()` result down to the alerts
 * whose `area_desc` mentions `county` — for a visitor-location "你所在地目前有
 * 哪些特報" view (a more direct answer than scanning the full nationwide list).
 *
 * Deliberately a pure filter over the same list the full-list widget already
 * renders, not a second query: every dataset `listActiveCwaAlerts` merges
 * (general CWA alerts, tsunamis, and W-C0033-001 township hazards, whose
 * `area_desc` is a GROUP_CONCAT of full township names like "臺北市信義區") already
 * puts the county name as a prefix or whole token inside `area_desc`, so a
 * substring match is enough — no second SQL query, and the result can never
 * disagree with what the full list already shows.
 *
 * `county` should be a canonical name from `countyBounds.ts` (`resolveNearestCounty`
 * or one of the 22 keys); both the 臺-prefixed and 台-prefixed spellings are
 * checked, since CWA's own `area_desc` text is not consistent about which it uses.
 *
 * Lives in its own module, separate from `lib/server/cwa/queries.ts`, purely so it can be
 * unit-tested with a plain dynamic import: `queries.ts` pulls in `lib/server/db/mysql.ts`
 * (which throws at import time without MYSQL_HOST etc. set), so a test can't import anything
 * from that file directly without a live DB environment. This file only imports a type.
 */
export const filterCwaAlertsByCounty = (alerts: CwaAlertItem[], county: string): CwaAlertItem[] => {
  const variants = county.startsWith("臺") ? [county, `台${county.slice(1)}`] : [county];
  return alerts.filter((alert) => alert.area_desc != null && variants.some((name) => alert.area_desc!.includes(name)));
};
