import type { RowDataPacket } from "mysql2/promise";
import { withConnectionFallback } from "@/lib/server/db/mysql";
import type { YouBikeStation } from "./types";
import { readSeedJson } from "@/lib/server/db/seedReader";

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

function getSeedStations(): YouBikeStation[] {
  return readSeedJson<YouBikeStation[]>("youbike-stations-seed.json") || [];
}

export async function searchYouBikeStations(options?: {
  cityCode?: string;
  district?: string;
  keyword?: string;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  limit?: number;
}): Promise<{ stations: YouBikeStation[]; total: number }> {
  const limit = Math.min(options?.limit ?? 60, 200);

  // Fallback function using seed
  const runFallback = () => {
    let list = getSeedStations().map((s) => ({ ...s }));

    if (options?.cityCode) {
      list = list.filter((s) => s.cityCode === options.cityCode);
    }
    if (options?.district) {
      list = list.filter((s) => s.districtTw.includes(options.district!));
    }
    if (options?.keyword) {
      const kw = options.keyword.toLowerCase().trim();
      list = list.filter(
        (s) => s.nameTw.toLowerCase().includes(kw) || s.addressTw.toLowerCase().includes(kw)
      );
    }

    if (
      options?.lat !== undefined &&
      options?.lng !== undefined &&
      Number.isFinite(options.lat) &&
      Number.isFinite(options.lng)
    ) {
      const uLat = options.lat;
      const uLng = options.lng;
      const radiusKm = options.radiusMeters ? options.radiusMeters / 1000 : 5;

      list = list
        .map((s) => {
          const d = haversineDistanceKm(uLat, uLng, s.lat, s.lng);
          return { ...s, distanceKm: d };
        })
        .filter((s) => s.distanceKm! <= radiusKm)
        .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    }

    return { stations: list.slice(0, limit), total: list.length };
  };

  return withConnectionFallback(runFallback(), async (conn) => {
    const conditions: string[] = ["is_active = 1"];
    const params: any[] = [];

    if (options?.cityCode) {
      conditions.push("city_code = ?");
      params.push(options.cityCode);
    }
    if (options?.district) {
      conditions.push("district_tw LIKE ?");
      params.push(`%${options.district}%`);
    }
    if (options?.keyword) {
      conditions.push("(name_tw LIKE ? OR address_tw LIKE ?)");
      params.push(`%${options.keyword}%`, `%${options.keyword}%`);
    }

    const hasGeo =
      options?.lat !== undefined &&
      options?.lng !== undefined &&
      Number.isFinite(options.lat) &&
      Number.isFinite(options.lng);

    let selectDistance = "";
    let orderBy = "id ASC";

    if (hasGeo) {
      const uLat = options!.lat!;
      const uLng = options!.lng!;
      selectDistance = `, (6371 * acos(cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) + sin(radians(?)) * sin(radians(lat)))) AS distance_km`;
      params.unshift(uLat, uLng, uLat);

      if (options?.radiusMeters) {
        conditions.push(
          `(6371 * acos(cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) + sin(radians(?)) * sin(radians(lat)))) <= ?`
        );
        params.push(uLat, uLng, uLat, options.radiusMeters / 1000);
      }
      orderBy = "distance_km ASC";
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT
        id,
        city_code AS cityCode,
        station_no AS stationNo,
        name_tw AS nameTw,
        district_tw AS districtTw,
        address_tw AS addressTw,
        CAST(lat AS DOUBLE) AS lat,
        CAST(lng AS DOUBLE) AS lng,
        total_spaces AS totalSpaces,
        available_bikes AS availableBikes,
        available_ebikes AS availableEbikes,
        empty_spaces AS emptySpaces,
        is_active AS isActive,
        DATE_FORMAT(updated_at_source, '%Y-%m-%d %H:%i:%s') AS updatedAtSource
        ${selectDistance}
      FROM youbike_stations
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ?`,
      [...params, limit]
    );

    const stations: YouBikeStation[] = (rows as any[]).map((r) => ({
      ...r,
      distanceKm: r.distance_km !== undefined ? Math.round(Number(r.distance_km) * 100) / 100 : undefined,
    }));

    return { stations, total: stations.length };
  });
}
