import type { RowDataPacket } from "mysql2/promise";
import { withConnection, withConnectionFallback } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import { memoizeQuery } from "@/lib/server/cache/memo";
import { readTransientSeedJson } from "@/lib/server/db/transientSeed";

export interface PlaActivityItem {
  id?: number;
  activityDate: string; // YYYY-MM-DD
  periodStart: string | null; // YYYY-MM-DD HH:mm:ss
  periodEnd: string | null;   // YYYY-MM-DD HH:mm:ss
  title: string;
  aircraftTotal: number;
  aircraftCrossed: number;
  vesselsTotal: number;
  officialShipsTotal: number;
  description: string;
  aircraftDetails: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  syncedAt?: string;
}

const mapPlaActivityRow = (row: RowDataPacket): PlaActivityItem => {
  const formatDateTime = (val: unknown): string | null => {
    if (!val) return null;
    if (val instanceof Date) {
      return val.toISOString().slice(0, 19).replace("T", " ");
    }
    const str = String(val);
    return str.length >= 19 ? str.slice(0, 19).replace("T", " ") : str;
  };

  return {
    id: row.id != null ? Number(row.id) : undefined,
    activityDate:
      row.activity_date instanceof Date
        ? row.activity_date.toISOString().slice(0, 10)
        : String(row.activity_date).slice(0, 10),
    periodStart: formatDateTime(row.period_start),
    periodEnd: formatDateTime(row.period_end),
    title: String(row.title ?? ""),
    aircraftTotal: Number(row.aircraft_total ?? 0),
    aircraftCrossed: Number(row.aircraft_crossed ?? 0),
    vesselsTotal: Number(row.vessels_total ?? 0),
    officialShipsTotal: Number(row.official_ships_total ?? 0),
    description: String(row.description ?? ""),
    aircraftDetails: row.aircraft_details ? String(row.aircraft_details) : null,
    imageUrl: row.image_url ? String(row.image_url) : null,
    sourceUrl: String(row.source_url ?? "https://www.mnd.gov.tw/news/plaactlist"),
    syncedAt: row.synced_at ? (row.synced_at instanceof Date ? row.synced_at.toISOString() : String(row.synced_at)) : undefined,
  };
};

/**
 * Reads PLA activities seed data from data/pla-activities-seed.json via transientSeed loader.
 * Guarantees newest dates first.
 */
export function getPlaActivitiesSeed(): PlaActivityItem[] {
  try {
    const seed = readTransientSeedJson<PlaActivityItem[]>("pla-activities-seed.json");
    if (Array.isArray(seed)) {
      return [...seed].sort((a, b) => b.activityDate.localeCompare(a.activityDate));
    }
  } catch (err) {
    console.warn("[PLA Activities] Failed to load transient seed:", err);
  }
  return [];
}

const PLA_ACTIVITIES_UPSERT_SQL = `
  INSERT INTO pla_activities
    (activity_date, period_start, period_end, title, aircraft_total, aircraft_crossed,
     vessels_total, official_ships_total, description, aircraft_details, image_url, source_url,
     synced_at, created_at, updated_at)
  VALUES ?
  ON DUPLICATE KEY UPDATE
    period_start = VALUES(period_start),
    period_end = VALUES(period_end),
    title = VALUES(title),
    aircraft_total = VALUES(aircraft_total),
    aircraft_crossed = VALUES(aircraft_crossed),
    vessels_total = VALUES(vessels_total),
    official_ships_total = VALUES(official_ships_total),
    description = VALUES(description),
    aircraft_details = VALUES(aircraft_details),
    image_url = VALUES(image_url),
    source_url = VALUES(source_url),
    synced_at = VALUES(synced_at),
    updated_at = VALUES(updated_at)
`;

/**
 * Upserts a batch of PLA activity records keyed on activity_date.
 */
export async function upsertPlaActivities(
  activities: (PlaActivityItem | Omit<PlaActivityItem, "id">)[],
): Promise<{ inserted: number; updated: number }> {
  if (activities.length === 0) return { inserted: 0, updated: 0 };

  return chunkedUpsert(
    activities,
    PLA_ACTIVITIES_UPSERT_SQL,
    (item, now) => [
      item.activityDate,
      item.periodStart || null,
      item.periodEnd || null,
      item.title,
      item.aircraftTotal,
      item.aircraftCrossed,
      item.vesselsTotal,
      item.officialShipsTotal,
      item.description,
      item.aircraftDetails || null,
      item.imageUrl || null,
      item.sourceUrl,
      now,
      now,
      now,
    ],
  );
}

/**
 * Retrieves the latest PLA activities (defaults to 30 days), newest first.
 * Gracefully falls back to high-fidelity seed data if MySQL is offline or table is empty.
 * In-memory memoized for 60 seconds.
 */
export async function getPlaActivities(limit = 30): Promise<PlaActivityItem[]> {
  const seed = getPlaActivitiesSeed().slice(0, limit);

  return memoizeQuery(`pla_activities_latest_${limit}`, async () => {
    return withConnectionFallback(seed, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, activity_date, period_start, period_end, title, aircraft_total,
                aircraft_crossed, vessels_total, official_ships_total, description,
                aircraft_details, image_url, source_url, synced_at
         FROM pla_activities
         ORDER BY activity_date DESC
         LIMIT ?`,
        [limit],
      );

      if (!rows || rows.length === 0) {
        return seed;
      }

      return rows.map(mapPlaActivityRow);
    });
  });
}

/**
 * Retrieves a single day's activity record by date (YYYY-MM-DD).
 */
export async function getPlaActivityByDate(date: string): Promise<PlaActivityItem | null> {
  const activities = await getPlaActivities(60);
  return activities.find((a) => a.activityDate === date) ?? null;
}
