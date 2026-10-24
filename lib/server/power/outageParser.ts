import { XMLParser } from "fast-xml-parser";

export interface PowerOutageIncident {
  id: string;
  county: string;
  township: string;
  village: string;
  outageCount: number;
  restoreTime: string | null;
  contactPhone: string;
  updateTime: string;
  coordinates: [number, number][]; // [lng, lat]
}

export interface CountySummary {
  county: string;
  outageCount: number;
  villageCount: number;
  count: number; // Satisfies SPEC count alias
}

export interface PowerOutagesResponse {
  totalOutageCount: number;
  affectedVillagesCount: number;
  countySummaries: CountySummary[];
  incidents: PowerOutageIncident[];
  updatedAt: string;
}

/**
 * Normalizes Taiwan administrative divisions:
 * First 3 characters are typically county/city (e.g. 嘉義縣, 臺北市, 新北市).
 */
export function splitAdminArea(rawAdmin: string): { county: string; township: string } {
  if (!rawAdmin) return { county: "", township: "" };
  const s = rawAdmin.trim();
  if (s.length >= 3 && (s[2] === "縣" || s[2] === "市")) {
    return {
      county: normalizeCountyName(s.slice(0, 3)),
      township: s.slice(3).trim(),
    };
  }
  const match = s.match(/^(.+?[縣市])(.*)$/);
  if (match) {
    return {
      county: normalizeCountyName(match[1]),
      township: match[2].trim(),
    };
  }
  return { county: s, township: "" };
}

export function normalizeCountyName(name: string): string {
  return name.replace(/^台/, "臺");
}

export function parseOutageCount(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) && val >= 0 ? Math.floor(val) : 0;
  if (!val) return 0;
  const cleaned = String(val).replace(/,/g, "").trim();
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Normalizes ROC and Western timestamps into standard "YYYY/MM/DD HH:mm:ss" or null.
 * Handles ROC years (e.g., 115/10/23 -> 2026/10/23) and Chinese AM/PM indicators.
 */
export function normalizeTimestamp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (
    !s ||
    s === "未定" ||
    s === "暫無" ||
    s === "查修中" ||
    s === "null" ||
    s === "undefined" ||
    s === "—" ||
    s === "-"
  ) {
    return null;
  }

  // 1. ROC date: e.g. 115/10/23 or 115-10-23 or 115年10月23日
  const rocMatch = s.match(/^(\d{2,3})[\/\-年](\d{1,2})[\/\-月](\d{1,2})(?:日)?(?:\s+(.*))?$/);
  if (rocMatch) {
    const rocYear = parseInt(rocMatch[1], 10);
    if (rocYear < 1900) {
      const ceYear = rocYear + 1911;
      const month = rocMatch[2].padStart(2, "0");
      const day = rocMatch[3].padStart(2, "0");
      const timePart = rocMatch[4] ? parseTimePart(rocMatch[4]) : "";
      return timePart ? `${ceYear}/${month}/${day} ${timePart}` : `${ceYear}/${month}/${day}`;
    }
  }

  // 2. Western date: e.g. 2026/10/23 下午 05:00:00 or 2026-10-23 17:00:00 or 2026-10-23T17:00:00
  const ceMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s]+(.*))?$/);
  if (ceMatch) {
    const year = ceMatch[1];
    const month = ceMatch[2].padStart(2, "0");
    const day = ceMatch[3].padStart(2, "0");
    const timePart = ceMatch[4] ? parseTimePart(ceMatch[4]) : "";
    return timePart ? `${year}/${month}/${day} ${timePart}` : `${year}/${month}/${day}`;
  }

  return s;
}

function parseTimePart(timeStr: string): string {
  let t = timeStr
    .trim()
    .replace(/[時分秒]/g, (m) => (m === "秒" ? "" : ":"))
    .replace(/:+$/, "");
  const isPM = /下午|pm/i.test(t);
  const isAM = /上午|am/i.test(t);
  t = t.replace(/下午|上午|pm|am/gi, "").trim();

  const parts = t.split(":").map((p) => p.trim());
  if (parts.length >= 1 && parts[0] !== "") {
    let hour = parseInt(parts[0], 10);
    const min = parts[1] ? parts[1].padStart(2, "0") : "00";
    const sec = parts[2] ? parts[2].padStart(2, "0") : "00";

    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;

    return `${String(hour).padStart(2, "0")}:${min}:${sec}`;
  }
  return timeStr;
}

function findPlacemarks(node: unknown): unknown[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    return node.flatMap(findPlacemarks);
  }
  const obj = node as Record<string, unknown>;
  const placemarks: unknown[] = [];
  if (obj.Placemark) {
    if (Array.isArray(obj.Placemark)) {
      placemarks.push(...obj.Placemark);
    } else {
      placemarks.push(obj.Placemark);
    }
  }
  for (const [key, val] of Object.entries(obj)) {
    if (key !== "Placemark" && val && typeof val === "object") {
      placemarks.push(...findPlacemarks(val));
    }
  }
  return placemarks;
}

function getField(placemark: Record<string, any>, names: string[]): string | undefined {
  // Direct match
  for (const name of names) {
    if (placemark[name] !== undefined) {
      const v = placemark[name];
      if (typeof v === "object" && v !== null && v["#text"] !== undefined) {
        return String(v["#text"]).trim();
      }
      return String(v).trim();
    }
  }
  // Substring match on keys
  const keys = Object.keys(placemark);
  for (const name of names) {
    const matchedKey = keys.find((k) => k.includes(name));
    if (matchedKey && placemark[matchedKey] !== undefined) {
      const v = placemark[matchedKey];
      if (typeof v === "object" && v !== null && v["#text"] !== undefined) {
        return String(v["#text"]).trim();
      }
      return String(v).trim();
    }
  }
  // ExtendedData inspection
  const extendedData = placemark.ExtendedData;
  if (extendedData && typeof extendedData === "object") {
    const dataList = Array.isArray(extendedData.Data)
      ? extendedData.Data
      : extendedData.Data
      ? [extendedData.Data]
      : [];
    for (const item of dataList) {
      const itemName = item?.["@_name"] ?? item?.name;
      if (itemName && names.some((n) => itemName.includes(n))) {
        const val = item.value ?? item["#text"];
        if (val !== undefined) return String(val).trim();
      }
    }

    const schemaData = extendedData.SchemaData;
    if (schemaData && typeof schemaData === "object") {
      const simpleList = Array.isArray(schemaData.SimpleData)
        ? schemaData.SimpleData
        : schemaData.SimpleData
        ? [schemaData.SimpleData]
        : [];
      for (const item of simpleList) {
        const itemName = item?.["@_name"] ?? item?.name;
        if (itemName && names.some((n) => itemName.includes(n))) {
          const val = typeof item === "object" ? item["#text"] ?? item.value : item;
          if (val !== undefined) return String(val).trim();
        }
      }
    }
  }
  return undefined;
}

function findCoordinatesString(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (typeof obj.coordinates === "string") return obj.coordinates;
  if (obj.coordinates && typeof (obj.coordinates as any)["#text"] === "string") {
    return (obj.coordinates as any)["#text"];
  }
  for (const [, val] of Object.entries(obj)) {
    if (typeof val === "object" && val !== null) {
      const res = findCoordinatesString(val);
      if (res) return res;
    }
  }
  return null;
}

export function parseCoordinateString(raw: string): [number, number][] {
  const result: [number, number][] = [];
  const tuples = raw.trim().split(/\s+/);
  for (const tuple of tuples) {
    if (!tuple) continue;
    const parts = tuple.split(",");
    if (parts.length >= 2) {
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        result.push([lng, lat]);
      }
    }
  }
  return result;
}

export function extractCoordinates(node: unknown): [number, number][] {
  if (!node || typeof node !== "object") return [];
  const coordsStr = findCoordinatesString(node);
  if (!coordsStr) return [];
  return parseCoordinateString(coordsStr);
}

export function aggregateOutageData(
  incidents: PowerOutageIncident[],
  updatedAt?: string,
): PowerOutagesResponse {
  let totalOutageCount = 0;
  const countyMap = new Map<string, { outageCount: number; villageCount: number }>();

  for (const inc of incidents) {
    totalOutageCount += inc.outageCount;
    const county = inc.county || "其他";
    const existing = countyMap.get(county) ?? { outageCount: 0, villageCount: 0 };
    existing.outageCount += inc.outageCount;
    existing.villageCount += 1;
    countyMap.set(county, existing);
  }

  const countySummaries: CountySummary[] = Array.from(countyMap.entries())
    .map(([county, stats]) => ({
      county,
      outageCount: stats.outageCount,
      villageCount: stats.villageCount,
      count: stats.villageCount,
    }))
    .sort((a, b) => b.outageCount - a.outageCount);

  const affectedVillagesCount = incidents.length;

  return {
    totalOutageCount,
    affectedVillagesCount,
    countySummaries,
    incidents,
    updatedAt:
      updatedAt ||
      (incidents[0]?.updateTime
        ? normalizeTimestamp(incidents[0].updateTime) ?? incidents[0].updateTime
        : new Date().toISOString()),
  };
}

export function parsePowerOutagesXml(xmlText: string | null | undefined): PowerOutagesResponse {
  if (!xmlText || typeof xmlText !== "string" || !xmlText.trim()) {
    return {
      totalOutageCount: 0,
      affectedVillagesCount: 0,
      countySummaries: [],
      incidents: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const cleanXml = xmlText.replace(/^\uFEFF/, "").trim();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    parseTagValue: false,
  });

  let parsed: any;
  try {
    parsed = parser.parse(cleanXml);
  } catch (err) {
    console.error("Failed to parse Taipower KML XML:", err);
    return {
      totalOutageCount: 0,
      affectedVillagesCount: 0,
      countySummaries: [],
      incidents: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const rawPlacemarks = findPlacemarks(parsed);
  if (!rawPlacemarks || rawPlacemarks.length === 0) {
    return {
      totalOutageCount: 0,
      affectedVillagesCount: 0,
      countySummaries: [],
      incidents: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const incidents: PowerOutageIncident[] = [];
  let latestUpdateTime = "";

  for (let i = 0; i < rawPlacemarks.length; i++) {
    const pm = rawPlacemarks[i] as Record<string, any>;
    const rawAdmin = getField(pm, ["行政區", "admin_area", "adminArea"]) ?? "";
    const village = getField(pm, ["停電區域", "village", "villageName"]) ?? "";
    const rawOutageCount = getField(pm, ["影響戶數", "outage_count", "outageCount"]);
    const rawRestoreTime = getField(pm, ["預計修復時間", "restore_time", "restoreTime"]);
    const contactPhone =
      getField(pm, [
        "聯絡人(電話一)",
        "聯絡人（電話一）",
        "聯絡人_x0028_電話一_x0029_",
        "聯絡人電話",
        "contactPhone",
      ]) || "1911";
    const updateTime =
      getField(pm, ["資料更新時間", "update_time", "updateTime"]) || new Date().toISOString();

    const { county, township } = splitAdminArea(rawAdmin);
    const outageCount = parseOutageCount(rawOutageCount);
    const restoreTime = normalizeTimestamp(rawRestoreTime);
    const coordinates = extractCoordinates(pm);

    if (updateTime && (!latestUpdateTime || updateTime > latestUpdateTime)) {
      latestUpdateTime = updateTime;
    }

    const id = `${county}_${township}_${village}_${i + 1}`;

    incidents.push({
      id,
      county,
      township,
      village,
      outageCount,
      restoreTime,
      contactPhone,
      updateTime,
      coordinates,
    });
  }

  return aggregateOutageData(
    incidents,
    latestUpdateTime
      ? normalizeTimestamp(latestUpdateTime) ?? latestUpdateTime
      : undefined,
  );
}
