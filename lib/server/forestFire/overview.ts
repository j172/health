import {
  FOREST_FIRE_LEVELS,
  isKnownForestFireLevel,
  type ForestFireLevel,
} from "@/lib/tools/forestFire/levels";
import { getForestFireSite } from "./data/forestFireSites";
import type {
  ForestFireOverview,
  ForestFireSiteItem,
  StoredForestFireRow,
} from "./types";

const emptyCounts = (): Record<ForestFireLevel, number> => ({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 });

/**
 * Joins the stored latest-state rows with the coordinate seed and shapes the
 * payload served to the outdoor-safety page.
 *
 *  - A stored level outside 0-4 is dropped (never rendered as 安全).
 *  - A row not dated `today` is kept but flagged `stale`, and is excluded from
 *    `counts`, so a feed that stopped updating cannot masquerade as today's board.
 *  - A site missing from the seed is kept with null coordinates — nothing is invented.
 *  - No rows at all -> `asOf: null`, `isCurrent: false`, empty list.
 */
export const buildForestFireOverview = (
  rows: readonly StoredForestFireRow[],
  today: string,
): ForestFireOverview => {
  const counts = emptyCounts();
  const sites: ForestFireSiteItem[] = [];
  let asOf: string | null = null;
  let staleCount = 0;

  for (const row of rows) {
    if (!isKnownForestFireLevel(row.warnLevel)) continue;

    const stale = row.createdDate !== today;
    if (stale) staleCount += 1;
    else counts[row.warnLevel] += 1;
    if (asOf === null || row.createdDate > asOf) asOf = row.createdDate;

    const seed = getForestFireSite(row.siteCode);
    sites.push({
      siteCode: row.siteCode,
      name: row.siteName,
      kind: seed?.kind ?? null,
      level: row.warnLevel,
      levelName: FOREST_FIRE_LEVELS[row.warnLevel].name,
      createdDate: row.createdDate,
      stale,
      county: seed?.county ?? null,
      cityCode: seed?.cityCode ?? null,
      town: seed?.town ?? null,
      lat: seed?.lat ?? null,
      lng: seed?.lng ?? null,
    });
  }

  sites.sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? 1 : -1;
    if (a.level !== b.level) return b.level - a.level;
    return Number(a.siteCode) - Number(b.siteCode) || a.siteCode.localeCompare(b.siteCode);
  });

  return {
    today,
    asOf,
    isCurrent: rows.some((row) => row.createdDate === today && isKnownForestFireLevel(row.warnLevel)),
    counts,
    staleCount,
    sites,
  };
};
