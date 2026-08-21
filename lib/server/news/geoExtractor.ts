import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { withConnection, withConnectionFallback } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";
import {
  TAIWAN_DISTRICT_COORDINATES,
  TAIWAN_COUNTY_CENTROIDS,
} from "./data/taiwanDistricts";
import {
  queryOpenCage,
  queryNominatim,
} from "@/lib/server/facilities/geocodeProviders";
import {
  loadGeocodeBudgetState,
  isBudgetExhausted,
  recordGeocodeRequest,
  tripCircuitBreaker,
  type GeocodeProvider,
} from "@/lib/server/facilities/geocodeBudget";
import { normalizeAddressForQuery } from "@/lib/server/facilities/addressNormalize";

export interface ExtractedLocation {
  lat: number;
  lng: number;
  locationName: string;
  facilityId: number | null;
  matchType: "facility" | "district" | "county" | "geocoded";
}

// Prominent medical centers and regional hospital keywords with known aliases
const COMMON_HOSPITAL_PATTERNS: { regex: RegExp; searchName: string }[] = [
  {
    regex: /台大醫院|臺大醫院|臺灣大學醫學院附設醫院/,
    searchName: "國立臺灣大學醫學院附設醫院",
  },
  { regex: /台北榮總|臺北榮總|榮民總醫院|中榮|高榮/, searchName: "榮民總醫院" },
  {
    regex: /林口長庚|高雄長庚|基隆長庚|長庚醫院|長庚紀念醫院/,
    searchName: "長庚醫療財團法人",
  },
  {
    regex: /成大醫院|成功大學醫學院附設醫院/,
    searchName: "國立成功大學醫學院附設醫院",
  },
  { regex: /三軍總醫院|三總/, searchName: "三軍總醫院" },
  { regex: /馬偕醫院|馬偕紀念醫院/, searchName: "馬偕紀念醫院" },
  {
    regex: /新光醫院|新光吳火獅紀念醫院/,
    searchName: "新光醫療財團法人新光吳火獅紀念醫院",
  },
  {
    regex: /國泰醫院|國泰綜合醫院/,
    searchName: "國泰醫療財團法人國泰綜合醫院",
  },
  {
    regex: /亞東醫院|亞東紀念醫院/,
    searchName: "醫療財團法人徐元智先生醫藥基金會亞東紀念醫院",
  },
  { regex: /雙和醫院|雙和/, searchName: "衛生福利部雙和醫院" },
  { regex: /慈濟醫院|慈濟綜合醫院/, searchName: "佛教慈濟醫療財團法人" },
  {
    regex: /彰基|彰化基督教醫院/,
    searchName: "彰化基督教醫療財團法人彰化基督教醫院",
  },
  { regex: /奇美醫院|奇美醫療/, searchName: "奇美醫療財團法人奇美醫院" },
  { regex: /振興醫院/, searchName: "振興醫療財團法人振興醫院" },
  { regex: /萬芳醫院/, searchName: "臺北市立萬芳醫院" },
  {
    regex: /和平醫院|聯合醫院和平院區/,
    searchName: "臺北市立聯合醫院和平院區",
  },
  {
    regex: /仁愛醫院|聯合醫院仁愛院區/,
    searchName: "臺北市立聯合醫院仁愛院區",
  },
  {
    regex: /中興醫院|聯合醫院中興院區/,
    searchName: "臺北市立聯合醫院中興院區",
  },
  {
    regex: /陽明醫院|聯合醫院陽明院區/,
    searchName: "臺北市立聯合醫院陽明院區",
  },
  {
    regex: /忠孝醫院|聯合醫院忠孝院區/,
    searchName: "臺北市立聯合醫院忠孝院區",
  },
  { regex: /童綜合醫院/, searchName: "童綜合醫療社團法人童綜合醫院" },
  { regex: /秀傳醫院/, searchName: "秀傳醫療社團法人秀傳紀念醫院" },
  { regex: /部立桃園醫院|衛福部桃園醫院/, searchName: "衛生福利部桃園醫院" },
  { regex: /部立台中醫院|衛福部台中醫院/, searchName: "衛生福利部臺中醫院" },
  { regex: /部立台南醫院|衛福部台南醫院/, searchName: "衛生福利部臺南醫院" },
  { regex: /部立花蓮醫院|衛福部花蓮醫院/, searchName: "衛生福利部花蓮醫院" },
  { regex: /部立台東醫院|衛福部台東醫院/, searchName: "衛生福利部臺東醫院" },
  { regex: /部立基隆醫院|衛福部基隆醫院/, searchName: "衛生福利部基隆醫院" },
  { regex: /部立台北醫院|衛福部台北醫院/, searchName: "衛生福利部臺北醫院" },
];

/**
 * Searches local facilities database for a matching medical/welfare facility by name.
 */
async function findFacilityInDb(
  searchName: string,
  existingConn?: PoolConnection,
): Promise<{
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
} | null> {
  // When the caller already holds a connection (e.g. persistItems, mid-transaction)
  // we must reuse it. Acquiring a second connection from an 8-slot pool while the
  // first is still checked out inside an open transaction deadlocks under load.
  const run = async (conn: PoolConnection) => {
    const pattern = `%${searchName}%`;
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT id, name, lat, lng, address
      FROM facilities
      WHERE name LIKE ? AND lat IS NOT NULL AND lng IS NOT NULL
      ORDER BY (CASE WHEN name = ? THEN 0 ELSE 1 END), id ASC
      LIMIT 1
      `,
      [pattern, searchName],
    );

    if (!rows[0]) return null;
    return {
      id: Number(rows[0].id),
      name: String(rows[0].name),
      lat: rows[0].lat != null ? Number(rows[0].lat) : null,
      lng: rows[0].lng != null ? Number(rows[0].lng) : null,
      address: rows[0].address ? String(rows[0].address) : null,
    };
  };

  if (existingConn) return run(existingConn);
  return withConnectionFallback(null, run);
}

/**
 * Normalizes 臺/台 across text.
 */
function normalizeTai(text: string): string {
  return text.replace(/臺/g, "台");
}

/**
 * Extracts coordinates and location metadata from news title and body text.
 */
export async function extractLocationFromText(
  title: string,
  content?: string | null,
  allowExternalGeocode = false,
  existingConn?: PoolConnection,
): Promise<ExtractedLocation | null> {
  const combinedText = `${title} ${content || ""}`.trim();
  if (!combinedText) return null;

  // 1. Facility Database Match (Zero API Cost)
  for (const { regex, searchName } of COMMON_HOSPITAL_PATTERNS) {
    if (regex.test(combinedText)) {
      const facility = await findFacilityInDb(searchName, existingConn);
      if (facility && facility.lat && facility.lng) {
        return {
          lat: facility.lat,
          lng: facility.lng,
          locationName: facility.name,
          facilityId: facility.id,
          matchType: "facility",
        };
      }
    }
  }

  // 2. Specific District Match (e.g. 台北市大安區, 台中市西屯區, 花蓮縣玉里鎮)
  const normalized = normalizeTai(combinedText);
  for (const item of TAIWAN_DISTRICT_COORDINATES) {
    const fullNameNorm = normalizeTai(item.fullName);
    const countyNorm = normalizeTai(item.county);
    const districtNorm = normalizeTai(item.district);

    // Full match: "台北市大安區"
    if (normalized.includes(fullNameNorm)) {
      return {
        lat: item.lat,
        lng: item.lng,
        locationName: item.fullName,
        facilityId: null,
        matchType: "district",
      };
    }

    // Contextual match: Title or text contains county AND district nearby
    if (normalized.includes(countyNorm) && normalized.includes(districtNorm)) {
      return {
        lat: item.lat,
        lng: item.lng,
        locationName: item.fullName,
        facilityId: null,
        matchType: "district",
      };
    }
  }

  // 3. County Centroid Match (e.g. 台北市, 高雄市, 花蓮縣, 澎湖縣)
  for (const countyItem of TAIWAN_COUNTY_CENTROIDS) {
    const countyNorm = normalizeTai(countyItem.name);
    if (normalized.includes(countyNorm)) {
      return {
        lat: countyItem.lat,
        lng: countyItem.lng,
        locationName: countyItem.name,
        facilityId: null,
        matchType: "county",
      };
    }
  }

  // 4. External Geocoding API Fallback (Controlled rate & daily budget)
  if (allowExternalGeocode) {
    // Look for address-like fragments: [縣市][區鄉鎮市][路街道巷弄號]
    const addressMatch = combinedText.match(
      /([台臺][北中南東]|新北|桃園|新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|臺東|台東|澎湖|金門|連江)[縣市][^，,。\n\r ]{2,20}(?:路|街|大道|巷|弄|號)/,
    );
    if (addressMatch) {
      const rawAddress = addressMatch[0];
      const normalizedQuery = normalizeAddressForQuery(rawAddress);

      if (normalizedQuery) {
        return withConnection(async (conn) => {
          const budgetState = await loadGeocodeBudgetState(conn);

          // Try OpenCage first if budget allows
          if (!isBudgetExhausted(budgetState, "opencage")) {
            await recordGeocodeRequest(conn, budgetState, "opencage");
            const outcome = await queryOpenCage(normalizedQuery);
            if (outcome.kind === "quota_exceeded") {
              await tripCircuitBreaker(conn, budgetState, "opencage");
            } else if (outcome.kind === "ok") {
              return {
                lat: outcome.coords.lat,
                lng: outcome.coords.lng,
                locationName: rawAddress,
                facilityId: null,
                matchType: "geocoded",
              };
            }
          }

          // Fallback to Nominatim
          if (!isBudgetExhausted(budgetState, "nominatim")) {
            await recordGeocodeRequest(conn, budgetState, "nominatim");
            const outcome = await queryNominatim(normalizedQuery);
            if (outcome.kind === "quota_exceeded") {
              await tripCircuitBreaker(conn, budgetState, "nominatim");
            } else if (outcome.kind === "ok") {
              return {
                lat: outcome.coords.lat,
                lng: outcome.coords.lng,
                locationName: rawAddress,
                facilityId: null,
                matchType: "geocoded",
              };
            }
          }

          return null;
        });
      }
    }
  }

  return null;
}

/**
 * Enriches a specific news item with geographic coordinates and location metadata.
 */
export async function enrichNewsItemLocation(
  newsItemId: number,
  title: string,
  content?: string | null,
  allowExternalGeocode = false,
): Promise<ExtractedLocation | null> {
  const location = await extractLocationFromText(
    title,
    content,
    allowExternalGeocode,
  );

  await withConnection(async (conn) => {
    if (location) {
      await conn.query(
        `
        UPDATE news_items
        SET lat = ?, lng = ?, location_name = ?, facility_id = ?
        WHERE id = ?
        `,
        [
          location.lat,
          location.lng,
          location.locationName,
          location.facilityId,
          newsItemId,
        ],
      );
    } else {
      await conn.query(
        `
        UPDATE news_items
        SET geocode_attempts = geocode_attempts + 1
        WHERE id = ?
        `,
        [newsItemId],
      );
    }
  });

  return location;
}
