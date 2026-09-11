import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";

export interface NpoTrustBadge {
  id: string;
  label: string;
  url?: string;
}

export interface NpoOrganizationItem {
  id: number;
  name: string;
  city: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  websiteSource?: "official" | "search" | null;
  email?: string | null;
  orgAttribute?: string | null;
  ban: string | null;
  changeDate: string | null;
  reason: string | null;
  serviceItem: string | null;
  purpose?: string | null;
  workFocus?: string | null;
  serviceArea?: string | null;
  contact?: string | null;
  lat?: number | null;
  lng?: number | null;
  hasProducts?: boolean;
  storeUrl?: string | null;
  productNote?: string | null;
  trustBadges?: NpoTrustBadge[];
  certifications?: string[];
}

export const mapRowToNpoItem = (r: RowDataPacket): NpoOrganizationItem => {
  let ban: string | null = null;
  let city: string = r.address || "";
  let changeDate: string | null = null;
  let reason: string | null = null;
  let website: string | null = null;
  let websiteSource: "official" | "search" | null = null;
  let email: string | null = null;
  let orgAttribute: string | null = null;
  let purpose: string | null = null;
  let workFocus: string | null = null;
  let serviceArea: string | null = null;
  let contact: string | null = null;
  let hasProducts: boolean = false;
  let storeUrl: string | null = null;
  let productNote: string | null = null;
  let trustBadges: NpoTrustBadge[] = [];
  let certifications: string[] = [];

  if (r.extra_json) {
    try {
      const extra = typeof r.extra_json === "string" ? JSON.parse(r.extra_json) : r.extra_json;
      if (extra.ban) ban = extra.ban;
      if (extra.city) city = extra.city;
      if (extra.changeDate) changeDate = extra.changeDate;
      if (extra.reason) reason = extra.reason;
      if (extra.website) website = extra.website;
      if (extra.websiteSource) websiteSource = extra.websiteSource;
      if (extra.email) email = extra.email;
      if (extra.orgAttribute) orgAttribute = extra.orgAttribute;
      if (extra.purpose) purpose = extra.purpose;
      if (extra.workFocus) workFocus = extra.workFocus;
      if (extra.serviceArea) serviceArea = extra.serviceArea;
      if (extra.contact) contact = extra.contact;
      if (extra.hasProducts === true || extra.hasProducts === "true") hasProducts = true;
      if (extra.storeUrl) storeUrl = extra.storeUrl;
      if (extra.productNote) productNote = extra.productNote;
      if (Array.isArray(extra.trustBadges)) trustBadges = extra.trustBadges;
      if (Array.isArray(extra.certifications)) certifications = extra.certifications;
    } catch {
      // fallback
    }
  }

  // Parse BAN from service_item if not in extra_json
  if (!ban && r.service_item) {
    const match = String(r.service_item).match(/統編：(\d{8})/);
    if (match) ban = match[1];
  }

  if (!changeDate && r.service_time) {
    const match = String(r.service_time).match(/最近異動：(\d+)/);
    if (match) changeDate = match[1];
  }

  // If city is long address, extract county
  if (city.length > 5) {
    const m = city.match(/(臺北市|台北市|新北市|基隆市|桃園市|新竹市|新竹縣|苗栗縣|臺中市|台中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|臺南市|台南市|高雄市|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)/);
    if (m) city = m[1].replace("台", "臺");
  }

  return {
    id: r.id,
    name: r.name || "",
    city: city || "其他",
    address: r.address || null,
    phone: r.phone || null,
    website,
    websiteSource,
    email,
    orgAttribute,
    ban,
    changeDate,
    reason,
    serviceItem: r.service_item || null,
    purpose,
    workFocus,
    serviceArea,
    contact,
    lat: r.lat ? Number(r.lat) : null,
    lng: r.lng ? Number(r.lng) : null,
    hasProducts,
    storeUrl,
    productNote,
    trustBadges: trustBadges.length > 0 ? trustBadges : undefined,
    certifications: certifications.length > 0 ? certifications : undefined,
  };
};

const HAS_PRODUCTS_SQL = `(extra_json LIKE '%"hasProducts":true%' OR extra_json LIKE '%"hasProducts":"true"%')`;
const HAS_BADGES_SQL = `(extra_json LIKE '%"trustBadges"%' OR extra_json LIKE '%"certifications"%')`;
const IS_NPO_CENTER_SQL = `(source_key = 'npo_tw' OR extra_json LIKE '%"npoCenterOrgid"%')`;

const ORDER_BY_PRIORITY = `
  ORDER BY
    CASE
      WHEN ${HAS_PRODUCTS_SQL} THEN 1
      WHEN ${HAS_BADGES_SQL} THEN 2
      WHEN ${IS_NPO_CENTER_SQL} THEN 3
      ELSE 4
    END ASC,
    id DESC
`;

export const getRecentNpoOrganizations = async (
  limit = 30,
  offset = 0,
): Promise<NpoOrganizationItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, name, address, phone, lat, lng, service_item, service_time, extra_json
       FROM facilities
       WHERE facility_type IN ('npo', 'tax_organization')
       ${ORDER_BY_PRIORITY}
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    return rows.map(mapRowToNpoItem);
  });

/** Total npo & tax_organization rows for pagination. */
/** Total npo & tax_organization rows for pagination. */
export const countNpoOrganizations = async (hasProducts?: boolean, hasBadges?: boolean): Promise<number> =>
  withConnection(async (conn) => {
    const conditions = ["facility_type IN ('npo', 'tax_organization')"];
    if (hasProducts) conditions.push(HAS_PRODUCTS_SQL);
    if (hasBadges) conditions.push(HAS_BADGES_SQL);
    const where = `WHERE ${conditions.join(" AND ")}`;
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM facilities ${where}`,
    );
    return Number(rows[0]?.total ?? 0);
  });

export interface SearchNpoOrganizationsParams {
  keyword?: string;
  city?: string;
  attribute?: string;
  hasProducts?: boolean;
  hasBadges?: boolean;
  limit?: number;
  offset?: number;
}

const buildSearchNpoOrganizationsWhere = ({
  keyword,
  city,
  attribute,
  hasProducts,
  hasBadges,
}: Pick<SearchNpoOrganizationsParams, "keyword" | "city" | "attribute" | "hasProducts" | "hasBadges">) => {
  const conditions: string[] = ["facility_type IN ('npo', 'tax_organization')"];
  const params: unknown[] = [];

  if (hasProducts) {
    conditions.push(HAS_PRODUCTS_SQL);
  }

  if (hasBadges) {
    conditions.push(HAS_BADGES_SQL);
  }

  if (keyword) {
    conditions.push(
      "(name LIKE ? OR service_item LIKE ? OR address LIKE ? OR extra_json LIKE ?)",
    );
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (city && city !== "全部縣市") {
    conditions.push("address LIKE ?");
    params.push(`%${city}%`);
  }

  if (attribute && attribute !== "全部屬性") {
    conditions.push("(extra_json LIKE ? OR service_item LIKE ?)");
    params.push(`%${attribute}%`, `%${attribute}%`);
  }

  return { whereClause: `WHERE ${conditions.join(" AND ")}`, params };
};

export const searchNpoOrganizations = async ({
  keyword,
  city,
  attribute,
  hasProducts,
  hasBadges,
  limit = 50,
  offset = 0,
}: SearchNpoOrganizationsParams): Promise<NpoOrganizationItem[]> =>
  withConnection(async (conn) => {
    const { whereClause, params } = buildSearchNpoOrganizationsWhere({
      keyword,
      city,
      attribute,
      hasProducts,
      hasBadges,
    });
    const query = `
      SELECT id, name, address, phone, lat, lng, service_item, service_time, extra_json
      FROM facilities
      ${whereClause}
      ${ORDER_BY_PRIORITY}
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const [rows] = await conn.query<RowDataPacket[]>(query, params);
    return rows.map(mapRowToNpoItem);
  });

export const countSearchNpoOrganizations = async ({
  keyword,
  city,
  attribute,
  hasProducts,
  hasBadges,
}: Pick<SearchNpoOrganizationsParams, "keyword" | "city" | "attribute" | "hasProducts" | "hasBadges">): Promise<number> =>
  withConnection(async (conn) => {
    const { whereClause, params } = buildSearchNpoOrganizationsWhere({
      keyword,
      city,
      attribute,
      hasProducts,
      hasBadges,
    });
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM facilities ${whereClause}`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  });

export const getNpoOrganizationCities = async (): Promise<string[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT DISTINCT address AS city
       FROM facilities
       WHERE facility_type IN ('npo', 'tax_organization') AND address IS NOT NULL AND address != ''
       ORDER BY address ASC`,
    );
    const citiesSet = new Set<string>();
    for (const r of rows) {
      const addr = String(r.city || "");
      const m = addr.match(/(臺北市|台北市|新北市|基隆市|桃園市|新竹市|新竹縣|苗栗縣|臺中市|台中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|臺南市|台南市|高雄市|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)/);
      if (m) {
        citiesSet.add(m[1].replace("台", "臺"));
      }
    }
    return Array.from(citiesSet).sort();
  });

export const getNpoOrganizationAttributes = async (): Promise<string[]> => [
  "全部屬性",
  "老人福利",
  "身心障礙福利",
  "兒童青少年福利",
  "環境保護",
  "綜合性服務",
  "社區發展",
  "急難救助",
  "醫療衛生",
  "文教藝術",
  "性別平權與婦女",
  "原住民與多元族群",
  "國際倡議與交流",
];
