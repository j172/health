import "server-only";
import { getPool } from "@/lib/server/db/mysql";
import {
  fetchTourismFacility,
  fetchTourismService,
  fetchTourismPackage,
  fetchTourismFacilityAlert,
  fetchSeniorCard,
  flattenTourismFacilityCategories,
  cityCodeToCounty,
  SENIOR_CARD_CITIES,
  type TourismFacility,
  type TourismService,
  type TourismPackage,
  type TourismFacilityAlert,
} from "./tdxClient";

export interface SeniorTourismSyncSummary {
  ok: boolean;
  facilitiesUpserted: number;
  servicesUpserted: number;
  packagesUpserted: number;
  errors: string[];
}

export interface SeniorTourismAlertsSyncSummary {
  ok: boolean;
  alertsUpserted: number;
  errors: string[];
}

export interface SeniorCardSyncSummary {
  ok: boolean;
  subsidiesUpserted: number;
  errors: string[];
}

/** Best-effort date parser for TDX's ISO-ish timestamps — returns null (not
 * throwing) on anything unparseable so one bad row never aborts a batch
 * (same idiom as lib/server/transit/runSync.ts's toSqlDateTime()). */
const toSqlDateTime = (value?: string | null): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
};

/**
 * Facility + Service + SeniorTourPackage sync — registered as the daily cron
 * job (their TDX UpdateInterval is 86400). Each of the 3 TDX calls is
 * independently try/caught: a failed call is recorded into errors[] and its
 * corresponding table is left untouched (never cleared), so a continued TDX
 * 404 (see tdxClient.ts's base-path comment) never empties an already-synced
 * or seed-filled table. Mirrors lib/server/transit/runSync.ts's
 * try/catch-per-endpoint pattern.
 */
export async function runSeniorTourismSync(): Promise<SeniorTourismSyncSummary> {
  const summary: SeniorTourismSyncSummary = {
    ok: true,
    facilitiesUpserted: 0,
    servicesUpserted: 0,
    packagesUpserted: 0,
    errors: [],
  };

  const pool = getPool();
  if (!pool) {
    summary.ok = false;
    summary.errors.push("MySQL pool unavailable");
    return summary;
  }

  try {
    const facilities = await fetchTourismFacility();
    await pool.query("DELETE FROM senior_tourism_facilities");
    for (const f of facilities as TourismFacility[]) {
      if (!f.AttractionID) continue;
      const county = cityCodeToCounty(f.CityCode);
      for (const { category, item } of flattenTourismFacilityCategories(f)) {
        await pool.query(
          `INSERT INTO senior_tourism_facilities
            (attraction_id, attraction_name, city_code, county, facility_category, facility_name, building_name, floor_level, description, lat, lng)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            f.AttractionID,
            f.AttractionName || f.AttractionID,
            f.CityCode || null,
            county,
            category,
            item.FacilityName || null,
            item.BuildingName || null,
            item.FloorLevel || null,
            item.Description || null,
            item.PositionLat ?? null,
            item.PositionLon ?? null,
          ],
        );
        summary.facilitiesUpserted += 1;
      }
    }
  } catch (err) {
    summary.errors.push(`Facility fetch/upsert failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const services = await fetchTourismService();
    await pool.query("DELETE FROM senior_tourism_services");
    for (const s of services as TourismService[]) {
      if (!s.AttractionID) continue;
      const county = cityCodeToCounty(s.CityCode);
      await pool.query(
        `INSERT INTO senior_tourism_services
          (attraction_id, attraction_name, county, service_name, description, service_url, service_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          s.AttractionID,
          s.AttractionName || s.AttractionID,
          county,
          s.ServiceName || null,
          s.Description || null,
          s.ServiceURL || null,
          s.ServicePhone || null,
        ],
      );
      summary.servicesUpserted += 1;
    }
  } catch (err) {
    summary.errors.push(`Service fetch/upsert failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const packages = await fetchTourismPackage();
    await pool.query("DELETE FROM senior_tour_packages");
    for (const p of packages as TourismPackage[]) {
      if (!p.PackageName) continue;
      await pool.query(
        `INSERT INTO senior_tour_packages
          (package_name, description, booking_url, picture_url, issuing_entity)
         VALUES (?, ?, ?, ?, ?)`,
        [p.PackageName, p.Description || null, p.BookingURL || null, p.PictureURL || null, p.IssuingEntity || null],
      );
      summary.packagesUpserted += 1;
    }
  } catch (err) {
    summary.errors.push(`SeniorTourPackage fetch/upsert failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (summary.facilitiesUpserted === 0 && summary.servicesUpserted === 0 && summary.packagesUpserted === 0 && summary.errors.length > 0) {
    summary.ok = false;
  }

  return summary;
}

/**
 * Facility/Alert sync — registered as its own, more frequent (every 30
 * minutes) cron job since TDX reports this endpoint's UpdateInterval as -1
 * (event-triggered) rather than the daily 86400 the other three Tourism
 * endpoints use. Upserts on alert_id (TDX's own stable id) rather than
 * replacing the whole table, mirroring
 * lib/server/transit/runSync.ts's runTransitFacilityAlertsSync().
 */
export async function runSeniorTourismAlertsSync(): Promise<SeniorTourismAlertsSyncSummary> {
  const summary: SeniorTourismAlertsSyncSummary = { ok: true, alertsUpserted: 0, errors: [] };

  const pool = getPool();
  if (!pool) {
    summary.ok = false;
    summary.errors.push("MySQL pool unavailable");
    return summary;
  }

  try {
    const alerts = await fetchTourismFacilityAlert();
    for (const a of alerts as TourismFacilityAlert[]) {
      if (!a.AlertID) continue;
      await pool.query(
        `INSERT INTO senior_tourism_alerts
          (alert_id, type, target_id, target_name, reason, start_time, end_time, publish_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           type = VALUES(type),
           target_id = VALUES(target_id),
           target_name = VALUES(target_name),
           reason = VALUES(reason),
           start_time = VALUES(start_time),
           end_time = VALUES(end_time),
           publish_time = VALUES(publish_time),
           updated_at = NOW()`,
        [
          a.AlertID,
          a.Type || null,
          a.ID || null,
          a.Name || null,
          a.Reason || null,
          toSqlDateTime(a.StartTime),
          toSqlDateTime(a.EndTime),
          toSqlDateTime(a.PublishTime),
        ],
      );
      summary.alertsUpserted += 1;
    }
  } catch (err) {
    summary.errors.push(`Facility/Alert fetch/upsert failed: ${err instanceof Error ? err.message : String(err)}`);
    summary.ok = false;
  }

  return summary;
}

/**
 * Loops the 22 SeniorCard City codes (tdxClient.ts's SENIOR_CARD_CITIES).
 * Each county is independently try/caught — one county's TDX call failing
 * never aborts the rest, and that county's existing rows (seed or a prior
 * sync) are left untouched rather than cleared. On success for a county, its
 * old rows are replaced in one DELETE+INSERT batch since Subsidies[] has no
 * natural per-row key (spec §4: "先 DELETE WHERE county=? 再整批 INSERT").
 */
export async function runSeniorCardSync(): Promise<SeniorCardSyncSummary> {
  const summary: SeniorCardSyncSummary = { ok: true, subsidiesUpserted: 0, errors: [] };

  const pool = getPool();
  if (!pool) {
    summary.ok = false;
    summary.errors.push("MySQL pool unavailable");
    return summary;
  }

  // Batch 3 counties at a time, mirroring youbike/tdxClient.ts's batchSize=3
  // throttle against TDX's per-minute rate limit.
  const batchSize = 3;
  for (let i = 0; i < SENIOR_CARD_CITIES.length; i += batchSize) {
    const batch = SENIOR_CARD_CITIES.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (cityCode) => {
        const county = cityCodeToCounty(cityCode) || cityCode;
        try {
          const entries = await fetchSeniorCard(cityCode);
          if (entries.length === 0) return;

          await pool.query("DELETE FROM senior_card_subsidies WHERE county = ?", [county]);
          for (const entry of entries) {
            const subsidies = entry.Subsidies && entry.Subsidies.length > 0 ? entry.Subsidies : [{ Category: null, Description: null }];
            for (const subsidy of subsidies) {
              await pool.query(
                `INSERT INTO senior_card_subsidies
                  (county, card_name, info_url, category, description)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                  county,
                  entry.SeniorCardName || entry.AutorityName || null,
                  entry.URL || null,
                  subsidy.Category || null,
                  subsidy.Description || null,
                ],
              );
              summary.subsidiesUpserted += 1;
            }
          }
        } catch (err) {
          summary.errors.push(`${cityCode} (${county}) fetch/upsert failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );
  }

  return summary;
}
