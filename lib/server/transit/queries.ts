import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import {
  TRANSIT_HOTLINES_SEED,
  TRANSIT_ROUTES_SEED,
  TRANSIT_FACILITIES_SEED,
} from "./data/transitSeed";
import type {
  AccessibleTransitRoute,
  AccessibleTransitFacility,
  TransitAccessibilityOverview,
  TransitSystemType,
} from "./types";

interface DbRouteRow extends RowDataPacket {
  id: number;
  county: string;
  route_id: string;
  route_name: string;
  operator_name: string;
  low_floor_ratio: number | string;
  is_all_low_floor: number;
  wheelchair_slots: number;
  description: string | null;
}

interface DbFacilityRow extends RowDataPacket {
  id: number;
  county: string;
  system_type: string;
  station_or_agency: string;
  facility_name: string;
  service_phone: string | null;
  booking_rules: string | null;
  features_json: any;
  lat: number | string | null;
  lng: number | string | null;
}

export async function ensureTransitSeeded(): Promise<void> {
  await withConnection(async (conn) => {
    const [routeCount] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM accessible_transit_routes"
    );
    if ((routeCount[0]?.cnt || 0) === 0) {
      for (const r of TRANSIT_ROUTES_SEED) {
        await conn.execute(
          `INSERT INTO accessible_transit_routes 
           (county, route_id, route_name, operator_name, low_floor_ratio, is_all_low_floor, wheelchair_slots, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.county,
            r.routeId,
            r.routeName,
            r.operatorName,
            r.lowFloorRatio,
            r.isAllLowFloor ? 1 : 0,
            r.wheelchairSlots,
            r.description || null,
          ]
        );
      }
    }

    const [facCount] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM accessible_transit_facilities"
    );
    if ((facCount[0]?.cnt || 0) === 0) {
      for (const f of TRANSIT_FACILITIES_SEED) {
        await conn.execute(
          `INSERT INTO accessible_transit_facilities
           (county, system_type, station_or_agency, facility_name, service_phone, booking_rules, features_json, lat, lng)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            f.county,
            f.systemType,
            f.stationOrAgency,
            f.facilityName,
            f.servicePhone || null,
            f.bookingRules || null,
            JSON.stringify(f.features),
            f.lat || null,
            f.lng || null,
          ]
        );
      }
    }
  });
}

export async function getTransitAccessibilityOverview(filter?: {
  county?: string;
  systemType?: string;
  query?: string;
}): Promise<TransitAccessibilityOverview> {
  await ensureTransitSeeded();

  return await withConnection(async (conn) => {
    let routeSql = "SELECT * FROM accessible_transit_routes WHERE 1=1";
    const routeParams: any[] = [];

    if (filter?.county && filter.county !== "all") {
      routeSql += " AND county = ?";
      routeParams.push(filter.county);
    }
    if (filter?.query && filter.query.trim()) {
      routeSql += " AND (route_name LIKE ? OR operator_name LIKE ? OR description LIKE ?)";
      const q = `%${filter.query.trim()}%`;
      routeParams.push(q, q, q);
    }
    routeSql += " ORDER BY low_floor_ratio DESC, route_name ASC";

    const [routeRows] = await conn.query<DbRouteRow[]>(routeSql, routeParams);

    const routes: AccessibleTransitRoute[] = routeRows.map((r) => ({
      id: r.id,
      county: r.county,
      routeId: r.route_id,
      routeName: r.route_name,
      operatorName: r.operator_name,
      lowFloorRatio: Number(r.low_floor_ratio) || 0,
      isAllLowFloor: Boolean(r.is_all_low_floor),
      wheelchairSlots: r.wheelchair_slots,
      description: r.description,
    }));

    let facSql = "SELECT * FROM accessible_transit_facilities WHERE 1=1";
    const facParams: any[] = [];

    if (filter?.county && filter.county !== "all") {
      facSql += " AND (county = ? OR county = '全國')";
      facParams.push(filter.county);
    }
    if (filter?.systemType && filter.systemType !== "all") {
      facSql += " AND system_type = ?";
      facParams.push(filter.systemType);
    }
    if (filter?.query && filter.query.trim()) {
      facSql += " AND (facility_name LIKE ? OR station_or_agency LIKE ? OR booking_rules LIKE ?)";
      const q = `%${filter.query.trim()}%`;
      facParams.push(q, q, q);
    }

    const [facRows] = await conn.query<DbFacilityRow[]>(facSql, facParams);

    const facilities: AccessibleTransitFacility[] = facRows.map((f) => {
      let features: string[] = [];
      try {
        if (typeof f.features_json === "string") {
          features = JSON.parse(f.features_json);
        } else if (Array.isArray(f.features_json)) {
          features = f.features_json;
        }
      } catch {
        features = [];
      }

      return {
        id: f.id,
        county: f.county,
        systemType: f.system_type as TransitSystemType,
        stationOrAgency: f.station_or_agency,
        facilityName: f.facility_name,
        servicePhone: f.service_phone,
        bookingRules: f.booking_rules,
        features,
        lat: f.lat ? Number(f.lat) : null,
        lng: f.lng ? Number(f.lng) : null,
      };
    });

    let hotlines = TRANSIT_HOTLINES_SEED;
    if (filter?.county && filter.county !== "all") {
      hotlines = hotlines.filter((h) => h.county === filter.county);
    }

    const totalRoutes = routes.length;
    const avgLowFloorRatio =
      totalRoutes > 0
        ? Math.round(routes.reduce((sum, r) => sum + r.lowFloorRatio, 0) / totalRoutes)
        : 0;
    const allLowFloorCount = routes.filter((r) => r.isAllLowFloor).length;

    const counties = Array.from(new Set(TRANSIT_HOTLINES_SEED.map((h) => h.county)));
    const systemTypes: TransitSystemType[] = [
      "bus",
      "metro",
      "rail",
      "hsrail",
      "rehab_bus",
      "accessible_taxi",
    ];

    return {
      routes,
      facilities,
      hotlines,
      summary: {
        totalRoutes,
        avgLowFloorRatio,
        allLowFloorCount,
        rehabAgenciesCount: hotlines.length,
      },
      counties,
      systemTypes,
    };
  });
}
