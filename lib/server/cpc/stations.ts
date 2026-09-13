import { withConnection } from "@/lib/server/db/mysql";
import seedStations from "@/data/facilities-seeds/cpc_gas_station.json";

export interface CpcFuelTypes {
  unleaded92: boolean;
  unleaded95: boolean;
  unleaded98: boolean;
  alcoholGasoline: boolean;
  kerosene: boolean;
  superDiesel: boolean;
}

export interface CpcPaymentMethods {
  memberCard: boolean;
  selfServiceCard: boolean;
  eInvoice: boolean;
  easyCard: boolean;
  iPassCard: boolean;
  happyCash: boolean;
  selfServeDieselStation: boolean;
}

export interface CpcStationExtraJson {
  stationCode: string;
  postalCode: string;
  services: string[];
  serviceHours: Record<string, string>;
  landArea?: string;
  dataOrg: string;
  /** 油品種類供應旗標，來自中油 getStationInfo 端點；並非所有站點都有此資料。 */
  fuelTypes?: CpcFuelTypes;
  /** 付款方式旗標，來自中油 getStationInfo 端點；並非所有站點都有此資料。 */
  paymentMethods?: CpcPaymentMethods;
  /** 總營業時間（非個別加值服務的時段），來自中油 getStationInfo 端點。 */
  businessHours?: string;
  /** 洗車類別（如：自助投幣式、精緻手工、洗車機），來自中油 getStationInfo 端點。 */
  washCategory?: string;
}

export interface CpcStationItem {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  service_item: string | null;
  extra_json: CpcStationExtraJson;
  distance_km?: number;
}

export interface CpcStationSearchParams {
  keyword?: string;
  services?: string[];
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  limit?: number;
}

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

export async function searchCpcStations(params: CpcStationSearchParams = {}): Promise<{
  stations: CpcStationItem[];
  total: number;
  allServices: string[];
}> {
  const { keyword, services = [], lat, lng, radiusMeters = 50000, limit = 500 } = params;

  // Try DB first
  try {
    const dbResult = await withConnection(async (conn) => {
      const conditions = ["facility_type = 'cpc_gas_station'"];
      const sqlParams: any[] = [];

      if (keyword && keyword.trim()) {
        const k = `%${keyword.trim()}%`;
        conditions.push("(name LIKE ? OR address LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(extra_json, '$.stationCode')) LIKE ?)");
        sqlParams.push(k, k, k);
      }

      if (services && services.length > 0) {
        for (const s of services) {
          if (s && s.trim()) {
            conditions.push("service_item LIKE ?");
            sqlParams.push(`%${s.trim()}%`);
          }
        }
      }

      let distanceSelect = "";
      let havingClause = "";
      const isGps = lat !== undefined && lng !== undefined;

      if (isGps) {
        distanceSelect = `,
          (6371 * acos(
            cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) +
            sin(radians(?)) * sin(radians(lat))
          )) AS distance_km`;
        sqlParams.unshift(lat, lng, lat);
        havingClause = "HAVING distance_km <= ?";
        sqlParams.push(radiusMeters / 1000);
        conditions.push("lat IS NOT NULL AND lng IS NOT NULL");
      }

      const orderBy = isGps ? "distance_km ASC" : "name ASC";
      const sql = `
        SELECT id, name, address, phone, lat, lng, service_item, extra_json ${distanceSelect}
        FROM facilities
        WHERE ${conditions.join(" AND ")}
        ${havingClause}
        ORDER BY ${orderBy}
        LIMIT ?
      `;
      sqlParams.push(limit);

      const [rows] = await conn.query<any[]>(sql, sqlParams);
      if (Array.isArray(rows) && rows.length > 0) {
        const stations: CpcStationItem[] = rows.map((r) => {
          let extra = r.extra_json;
          if (typeof extra === "string") {
            try {
              extra = JSON.parse(extra);
            } catch {
              extra = {};
            }
          }
          return {
            id: r.id,
            name: r.name,
            address: r.address,
            phone: r.phone,
            lat: r.lat ? Number(r.lat) : null,
            lng: r.lng ? Number(r.lng) : null,
            service_item: r.service_item,
            extra_json: extra as CpcStationExtraJson,
            distance_km: r.distance_km !== undefined ? Number(r.distance_km) : undefined,
          };
        });

        return {
          stations,
          total: stations.length,
          allServices: getAllServicesFromSeed(),
        };
      }
      return null;
    });

    if (dbResult) return dbResult;
  } catch (err) {
    // Fall back to seed data
  }

  // Seed Fallback
  let items = (seedStations as unknown as CpcStationItem[]).map((s) => ({ ...s }));

  if (keyword && keyword.trim()) {
    const kw = keyword.trim().toLowerCase();
    items = items.filter(
      (s) =>
        s.name.toLowerCase().includes(kw) ||
        (s.address && s.address.toLowerCase().includes(kw)) ||
        (s.extra_json?.stationCode && s.extra_json.stationCode.toLowerCase().includes(kw)),
    );
  }

  if (services && services.length > 0) {
    items = items.filter((s) => {
      const stationServices = s.extra_json?.services || [];
      return services.every((req) => stationServices.includes(req));
    });
  }

  if (lat !== undefined && lng !== undefined) {
    const maxKm = radiusMeters / 1000;
    const withDist = items
      .map((s) => {
        if (s.lat && s.lng) {
          const dist = haversineDistanceKm(lat, lng, s.lat, s.lng);
          return { ...s, distance_km: dist };
        }
        return { ...s, distance_km: 99999 };
      })
      .filter((s) => (s.distance_km ?? 99999) <= maxKm);

    withDist.sort((a, b) => (a.distance_km ?? 99999) - (b.distance_km ?? 99999));
    items = withDist;
  }

  return {
    stations: items.slice(0, limit),
    total: items.length,
    allServices: getAllServicesFromSeed(),
  };
}

function getAllServicesFromSeed(): string[] {
  const set = new Set<string>();
  for (const st of seedStations as unknown as CpcStationItem[]) {
    if (st.extra_json?.services) {
      for (const s of st.extra_json.services) {
        set.add(s);
      }
    }
  }
  return Array.from(set).sort();
}
