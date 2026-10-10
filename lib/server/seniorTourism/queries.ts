import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { TAIWAN_COUNTIES } from "@/lib/constants/taiwanDistricts";
import {
  SENIOR_CARD_SUBSIDIES_SEED,
  SENIOR_TOURISM_FACILITIES_SEED,
  SENIOR_TOURISM_SERVICES_SEED,
  SENIOR_TOUR_PACKAGES_SEED,
} from "./data/seniorFriendlySeed";
import type {
  SeniorFriendlyOverview,
  SeniorCardEntry,
  TourismFacilityEntry,
  TourismServiceEntry,
  TourPackageEntry,
  TourismAlertEntry,
} from "./types";

interface DbTourismFacilityRow extends RowDataPacket {
  attraction_name: string;
  county: string | null;
  facility_category: string;
  facility_name: string | null;
  description: string | null;
  lat: number | string | null;
  lng: number | string | null;
}

interface DbTourismServiceRow extends RowDataPacket {
  attraction_name: string;
  county: string | null;
  service_name: string | null;
  description: string | null;
  service_url: string | null;
  service_phone: string | null;
}

interface DbTourPackageRow extends RowDataPacket {
  package_name: string;
  description: string | null;
  booking_url: string | null;
  picture_url: string | null;
  issuing_entity: string | null;
}

interface DbTourismAlertRow extends RowDataPacket {
  alert_id: string;
  type: string | null;
  target_name: string | null;
  reason: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface DbSeniorCardRow extends RowDataPacket {
  county: string;
  card_name: string | null;
  info_url: string | null;
  category: string | null;
  description: string | null;
}

/**
 * Seeds the 5 senior-friendly tables when (and only when) each is empty —
 * same "table為空才灌 seed" idiom as lib/server/transit/queries.ts's
 * ensureTransitSeeded(). A real TDX sync run (see runSync.ts) always writes
 * real rows first, so this never overwrites synced data — it only fires
 * before the very first successful sync, or while the TDX base path is
 * still unresolved (see lib/server/seniorTourism/tdxClient.ts).
 */
export async function ensureSeniorFriendlySeeded(): Promise<void> {
  await withConnection(async (conn) => {
    const [cardCount] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM senior_card_subsidies",
    );
    if ((cardCount[0]?.cnt || 0) === 0) {
      for (const s of SENIOR_CARD_SUBSIDIES_SEED) {
        await conn.execute(
          `INSERT INTO senior_card_subsidies (county, card_name, info_url, category, description)
           VALUES (?, ?, ?, ?, ?)`,
          [s.county, s.cardName, s.infoUrl, s.category, s.description],
        );
      }
    }

    const [facCount] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM senior_tourism_facilities",
    );
    if ((facCount[0]?.cnt || 0) === 0) {
      for (const f of SENIOR_TOURISM_FACILITIES_SEED) {
        await conn.execute(
          `INSERT INTO senior_tourism_facilities
            (attraction_id, attraction_name, county, facility_category, facility_name, description)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [f.attractionId, f.attractionName, f.county, f.category, f.facilityName, f.description],
        );
      }
    }

    const [svcCount] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM senior_tourism_services",
    );
    if ((svcCount[0]?.cnt || 0) === 0) {
      for (const s of SENIOR_TOURISM_SERVICES_SEED) {
        await conn.execute(
          `INSERT INTO senior_tourism_services
            (attraction_id, attraction_name, county, service_name, description, service_url)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [s.attractionId, s.attractionName, s.county, s.serviceName, s.description, s.serviceUrl],
        );
      }
    }

    const [pkgCount] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM senior_tour_packages",
    );
    if ((pkgCount[0]?.cnt || 0) === 0) {
      for (const p of SENIOR_TOUR_PACKAGES_SEED) {
        await conn.execute(
          `INSERT INTO senior_tour_packages (package_name, description, booking_url, picture_url, issuing_entity)
           VALUES (?, ?, ?, ?, ?)`,
          [p.packageName, p.description, p.bookingUrl, p.pictureUrl, p.issuingEntity],
        );
      }
    }
    // senior_tourism_alerts is deliberately never seeded — an empty alerts
    // list is a correct, honest state ("no active outages"), not a gap to
    // paper over the way the other 4 tables need a non-empty safety net.
  });
}

export async function getSeniorFriendlyOverview(filter?: {
  county?: string;
  query?: string;
}): Promise<SeniorFriendlyOverview> {
  await ensureSeniorFriendlySeeded();

  return await withConnection(async (conn) => {
    const county = filter?.county && filter.county !== "all" ? filter.county : undefined;
    const q = filter?.query && filter.query.trim() ? `%${filter.query.trim()}%` : undefined;

    // 1. SeniorCard subsidies, grouped by (county, card_name, info_url) into {county, cardName, infoUrl, subsidies[]}.
    let cardSql = "SELECT * FROM senior_card_subsidies WHERE 1=1";
    const cardParams: any[] = [];
    if (county) {
      cardSql += " AND county = ?";
      cardParams.push(county);
    }
    cardSql += " ORDER BY county ASC, id ASC";
    const [cardRows] = await conn.query<DbSeniorCardRow[]>(cardSql, cardParams);

    const cardGroups = new Map<string, SeniorCardEntry>();
    for (const r of cardRows) {
      const key = `${r.county}::${r.card_name || ""}::${r.info_url || ""}`;
      let entry = cardGroups.get(key);
      if (!entry) {
        entry = { county: r.county, cardName: r.card_name, infoUrl: r.info_url, subsidies: [] };
        cardGroups.set(key, entry);
      }
      if (r.category || r.description) {
        entry.subsidies.push({ category: r.category, description: r.description });
      }
    }
    const seniorCards = Array.from(cardGroups.values());

    // 2. Tourism facilities.
    let facSql = "SELECT * FROM senior_tourism_facilities WHERE 1=1";
    const facParams: any[] = [];
    if (county) {
      facSql += " AND (county = ? OR county IS NULL)";
      facParams.push(county);
    }
    if (q) {
      facSql += " AND (attraction_name LIKE ? OR facility_name LIKE ?)";
      facParams.push(q, q);
    }
    facSql += " ORDER BY attraction_name ASC";
    const [facRows] = await conn.query<DbTourismFacilityRow[]>(facSql, facParams);
    const tourismFacilities: TourismFacilityEntry[] = facRows.map((f) => ({
      attractionName: f.attraction_name,
      county: f.county,
      category: f.facility_category,
      facilityName: f.facility_name,
      description: f.description,
      lat: f.lat ? Number(f.lat) : null,
      lng: f.lng ? Number(f.lng) : null,
    }));

    // 3. Tourism services.
    let svcSql = "SELECT * FROM senior_tourism_services WHERE 1=1";
    const svcParams: any[] = [];
    if (county) {
      svcSql += " AND (county = ? OR county IS NULL)";
      svcParams.push(county);
    }
    if (q) {
      svcSql += " AND (attraction_name LIKE ? OR service_name LIKE ?)";
      svcParams.push(q, q);
    }
    svcSql += " ORDER BY attraction_name ASC";
    const [svcRows] = await conn.query<DbTourismServiceRow[]>(svcSql, svcParams);
    const tourismServices: TourismServiceEntry[] = svcRows.map((s) => ({
      attractionName: s.attraction_name,
      county: s.county,
      serviceName: s.service_name,
      description: s.description,
      serviceUrl: s.service_url,
      servicePhone: s.service_phone,
    }));

    // 4. Tour packages (nationwide, no county filter — CityCode-less by design per spec §2.1).
    let pkgSql = "SELECT * FROM senior_tour_packages WHERE 1=1";
    const pkgParams: any[] = [];
    if (q) {
      pkgSql += " AND (package_name LIKE ? OR issuing_entity LIKE ?)";
      pkgParams.push(q, q);
    }
    pkgSql += " ORDER BY package_name ASC";
    const [pkgRows] = await conn.query<DbTourPackageRow[]>(pkgSql, pkgParams);
    const tourPackages: TourPackageEntry[] = pkgRows.map((p) => ({
      packageName: p.package_name,
      description: p.description,
      bookingUrl: p.booking_url,
      pictureUrl: p.picture_url,
      issuingEntity: p.issuing_entity,
    }));

    // 5. Tourism alerts.
    let alertSql = "SELECT * FROM senior_tourism_alerts WHERE 1=1";
    const alertParams: any[] = [];
    if (q) {
      alertSql += " AND (target_name LIKE ? OR reason LIKE ?)";
      alertParams.push(q, q);
    }
    alertSql += " ORDER BY start_time DESC";
    const [alertRows] = await conn.query<DbTourismAlertRow[]>(alertSql, alertParams);
    const tourismAlerts: TourismAlertEntry[] = alertRows.map((a) => ({
      alertId: a.alert_id,
      type: a.type,
      targetName: a.target_name,
      reason: a.reason,
      startTime: a.start_time,
      endTime: a.end_time,
    }));

    return {
      seniorCards,
      tourismFacilities,
      tourismServices,
      tourPackages,
      tourismAlerts,
      counties: Array.from(TAIWAN_COUNTIES),
    };
  });
}
