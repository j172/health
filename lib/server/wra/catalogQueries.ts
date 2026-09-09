import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import {
  fetchReservoirCatalog,
  type ReservoirCatalogRecord,
} from "@/lib/server/wra/fetchReservoirCatalog";
import {
  fetchWaterLevelStationCatalog,
  type WaterLevelStationCatalogRecord,
} from "@/lib/server/wra/fetchWaterLevelStationCatalog";

/** Upserts reservoir catalog records keyed by reservoir_id. */
export const upsertReservoirCatalog = async (
  records: ReservoirCatalogRecord[],
): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO wra_reservoirs
      (reservoir_id, reservoir_name, river_name, town_name, area_code, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      reservoir_name = VALUES(reservoir_name),
      river_name = VALUES(river_name),
      town_name = VALUES(town_name),
      area_code = VALUES(area_code),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.reservoirId,
      r.reservoirName,
      r.riverName,
      r.townName,
      r.areaCode,
      now,
      now,
      now,
    ],
  );

/** Upserts water level station catalog records keyed by station_id. */
export const upsertWaterLevelStationCatalog = async (
  records: WaterLevelStationCatalogRecord[],
): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO wra_water_level_stations
      (station_id, station_name, observatory_identifier, river_name, location_address,
       alert_level_1, alert_level_2, alert_level_3, area_code, basin_code, observation_status,
       synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      station_name = VALUES(station_name),
      observatory_identifier = VALUES(observatory_identifier),
      river_name = VALUES(river_name),
      location_address = VALUES(location_address),
      alert_level_1 = VALUES(alert_level_1),
      alert_level_2 = VALUES(alert_level_2),
      alert_level_3 = VALUES(alert_level_3),
      area_code = VALUES(area_code),
      basin_code = VALUES(basin_code),
      observation_status = VALUES(observation_status),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.stationId,
      r.stationName,
      r.observatoryIdentifier,
      r.riverName,
      r.locationAddress,
      r.alertLevel1,
      r.alertLevel2,
      r.alertLevel3,
      r.areaCode,
      r.basinCode,
      r.observationStatus,
      now,
      now,
      now,
    ],
  );

let seedPromise: Promise<void> | null = null;

/**
 * Ensures the catalog tables have records on cold start. If either table is empty,
 * triggers a background sync so user queries have name mappings without delay.
 */
export async function ensureCatalogsSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      const [resCount, stCount] = await withConnection(async (conn) => {
        const [rRows] = await conn.query<RowDataPacket[]>(
          "SELECT COUNT(*) as cnt FROM wra_reservoirs",
        );
        const [sRows] = await conn.query<RowDataPacket[]>(
          "SELECT COUNT(*) as cnt FROM wra_water_level_stations",
        );
        return [Number(rRows[0]?.cnt ?? 0), Number(sRows[0]?.cnt ?? 0)];
      });

      if (resCount === 0) {
        console.log("[WRA Catalog] Seeding wra_reservoirs catalog table...");
        const resRecords = await fetchReservoirCatalog();
        await upsertReservoirCatalog(resRecords);
        console.log(`[WRA Catalog] Seeded ${resRecords.length} reservoirs.`);
      }

      if (stCount === 0) {
        console.log("[WRA Catalog] Seeding wra_water_level_stations catalog table...");
        const stRecords = await fetchWaterLevelStationCatalog();
        await upsertWaterLevelStationCatalog(stRecords);
        console.log(`[WRA Catalog] Seeded ${stRecords.length} water level stations.`);
      }
    } catch (err) {
      console.error("[WRA Catalog] Failed to seed catalogs:", err);
    } finally {
      seedPromise = null;
    }
  })();

  return seedPromise;
}
