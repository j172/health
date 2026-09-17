import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import {
  WATER_OUTAGES_SEED,
  EMERGENCY_WATER_STATIONS_SEED,
} from "./data/waterOutagesSeed";
import type {
  WaterOutageItem,
  EmergencyWaterStation,
  WaterOutagesOverview,
} from "./types";

interface DbOutageRow extends RowDataPacket {
  id: number;
  outage_id: string;
  title: string;
  county: string;
  township: string;
  outage_type: string;
  start_time: Date | string;
  end_time: Date | string;
  affected_areas: string;
  affected_households: number;
  contact_phone: string | null;
  status: string;
  water_stations_json: any;
  lat: number | string | null;
  lng: number | string | null;
  source: string;
  updated_at: Date | string;
}

export async function ensureWaterOutagesSeeded(): Promise<void> {
  try {
    await withConnection(async (conn) => {
      const [countResult] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) as cnt FROM wra_water_outages"
      );
      if ((countResult[0]?.cnt || 0) === 0) {
        for (const item of WATER_OUTAGES_SEED) {
          await conn.execute(
            `INSERT INTO wra_water_outages
             (outage_id, title, county, township, outage_type, start_time, end_time, affected_areas, affected_households, contact_phone, status, water_stations_json, lat, lng, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               status = VALUES(status),
               end_time = VALUES(end_time),
               updated_at = NOW()`,
            [
              item.outageId,
              item.title,
              item.county,
              item.township,
              item.outageType,
              new Date(item.startTime),
              new Date(item.endTime),
              item.affectedAreas,
              item.affectedHouseholds,
              item.contactPhone || null,
              item.status,
              JSON.stringify(item.waterStations || []),
              item.lat || null,
              item.lng || null,
              item.source,
            ]
          );
        }
      }
    });
  } catch (err) {
    console.warn("Water outages seeding fallback to memory:", err instanceof Error ? err.message : String(err));
  }
}

export async function getWaterOutagesOverview(filter?: {
  county?: string;
}): Promise<WaterOutagesOverview> {
  await ensureWaterOutagesSeeded();

  try {
    return await withConnection(async (conn) => {
      let sql = "SELECT * FROM wra_water_outages WHERE 1=1";
      const params: any[] = [];

      if (filter?.county && filter.county !== "all") {
        sql += " AND county = ?";
        params.push(filter.county);
      }
      sql += " ORDER BY start_time DESC";

      const [rows] = await conn.query<DbOutageRow[]>(sql, params);

      if (rows.length === 0) {
        return getMemorySeedOverview(filter?.county);
      }

      const allOutages: WaterOutageItem[] = rows.map((r) => {
        let stations: EmergencyWaterStation[] = [];
        try {
          if (r.water_stations_json) {
            stations =
              typeof r.water_stations_json === "string"
                ? JSON.parse(r.water_stations_json)
                : r.water_stations_json;
          }
        } catch {
          stations = [];
        }

        return {
          id: String(r.id),
          outageId: r.outage_id,
          title: r.title,
          county: r.county,
          township: r.township,
          outageType: (r.outage_type as "planned" | "emergency") || "planned",
          startTime:
            r.start_time instanceof Date
              ? r.start_time.toISOString()
              : String(r.start_time),
          endTime:
            r.end_time instanceof Date
              ? r.end_time.toISOString()
              : String(r.end_time),
          affectedAreas: r.affected_areas,
          affectedHouseholds: Number(r.affected_households) || 0,
          contactPhone: r.contact_phone || undefined,
          status: (r.status as "active" | "scheduled" | "resolved") || "active",
          lat: r.lat ? Number(r.lat) : undefined,
          lng: r.lng ? Number(r.lng) : undefined,
          waterStations: stations,
          source: r.source,
          updatedAt:
            r.updated_at instanceof Date
              ? r.updated_at.toISOString()
              : String(r.updated_at),
        };
      });

      const activeOutages = allOutages.filter((o) => o.status === "active");
      const scheduledOutages = allOutages.filter((o) => o.status === "scheduled");
      const resolvedOutages = allOutages.filter((o) => o.status === "resolved");

      let waterStations = EMERGENCY_WATER_STATIONS_SEED;
      if (filter?.county && filter.county !== "all") {
        waterStations = waterStations.filter((s) => s.county === filter.county);
      }

      const counties = Array.from(
        new Set([
          ...WATER_OUTAGES_SEED.map((o) => o.county),
          ...EMERGENCY_WATER_STATIONS_SEED.map((s) => s.county),
        ])
      );

      const totalAffectedHouseholds = activeOutages.reduce(
        (sum, o) => sum + o.affectedHouseholds,
        0
      );

      return {
        activeOutages,
        scheduledOutages,
        resolvedOutages,
        waterStations,
        summary: {
          totalActiveOutages: activeOutages.length,
          totalAffectedHouseholds,
          emergencyCount: activeOutages.filter((o) => o.outageType === "emergency")
            .length,
          plannedCount: activeOutages.filter((o) => o.outageType === "planned")
            .length,
          totalWaterStations: waterStations.length,
        },
        counties,
      };
    });
  } catch {
    return getMemorySeedOverview(filter?.county);
  }
}

function getMemorySeedOverview(countyFilter?: string): WaterOutagesOverview {
  let list = WATER_OUTAGES_SEED;
  let stations = EMERGENCY_WATER_STATIONS_SEED;

  if (countyFilter && countyFilter !== "all") {
    list = list.filter((o) => o.county === countyFilter);
    stations = stations.filter((s) => s.county === countyFilter);
  }

  const activeOutages = list.filter((o) => o.status === "active");
  const scheduledOutages = list.filter((o) => o.status === "scheduled");
  const resolvedOutages = list.filter((o) => o.status === "resolved");

  const counties = Array.from(
    new Set([
      ...WATER_OUTAGES_SEED.map((o) => o.county),
      ...EMERGENCY_WATER_STATIONS_SEED.map((s) => s.county),
    ])
  );

  return {
    activeOutages,
    scheduledOutages,
    resolvedOutages,
    waterStations: stations,
    summary: {
      totalActiveOutages: activeOutages.length,
      totalAffectedHouseholds: activeOutages.reduce(
        (sum, o) => sum + o.affectedHouseholds,
        0
      ),
      emergencyCount: activeOutages.filter((o) => o.outageType === "emergency")
        .length,
      plannedCount: activeOutages.filter((o) => o.outageType === "planned")
        .length,
      totalWaterStations: stations.length,
    },
    counties,
  };
}
