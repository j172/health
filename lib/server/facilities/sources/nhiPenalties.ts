import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv, normalizeAddress } from "@/lib/server/facilities/csv";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface FacilityPenaltyInfo {
  status: "active" | "suspended_execution" | "expired";
  category: string;
  reason?: string;
  clauses?: string;
  practitioner?: string;
  startDate?: string;
  endDate?: string;
  rawMinguoRange?: string;
  sourceTitle: string;
  updatedAt?: string;
}

export const NHI_PENALTY_URLS = {
  dl75736: "https://www.nhi.gov.tw/ch/dl-75736-d1b7cbd16af9438fa57fdef17add4061-1.csv", // 違規情節重大名冊
  dl75737: "https://www.nhi.gov.tw/ch/dl-75737-a8890d5e00fd4156b7cc4dfd1c3aeb4d-1.csv", // 停約名冊
  dl75738: "https://www.nhi.gov.tw/ch/dl-75738-7c98b001249b4327a71ce0a0171600fd-1.csv", // 五年內不予特約之地址
  dl87941: "https://www.nhi.gov.tw/ch/dl-87941-e93b44dea2c44425a5c0121bbde13292-1.csv", // 五年內不予特約之醫事機構及負責醫事人員
};

/**
 * Converts a Taiwan Minguo date string (e.g. "1150801", "1160731") to ISO YYYY-MM-DD.
 */
export function minguoToIsoDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d{2,3})(\d{2})(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10) + 1911;
  const month = m[2];
  const day = m[3];
  return `${year}-${month}-${day}`;
}

/**
 * Evaluates the penalty status based on execution dates and today's date.
 */
export function computePenaltyStatus(
  startDateIso: string | null,
  endDateIso: string | null,
  isSuspendedExecution: boolean,
  todayIso?: string,
): "active" | "suspended_execution" | "expired" {
  if (isSuspendedExecution) return "suspended_execution";
  const now = todayIso || new Date().toISOString().slice(0, 10);
  if (endDateIso && endDateIso < now) return "expired";
  return "active";
}

/**
 * Normalizes CSV headers by removing line breaks and whitespace.
 */
function cleanCsvText(text: string): string {
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.includes("序號"));
  if (headerIdx > 0) {
    return lines.slice(headerIdx).join("\n");
  }
  return text;
}

function normalizeKey(key: string): string {
  return key.replace(/[\r\n\s\/]/g, "").trim();
}

export interface ParsedPenaltiesResult {
  clinicPenalties: Map<
    string,
    FacilityPenaltyInfo & {
      agencyCode: string;
      name: string;
      address?: string;
      region?: string;
    }
  >;
  addressRecords: FacilityRecord[];
}

/**
 * Parses the raw CSV text from the 4 NHI penalty datasets into structured penalty items.
 */
export function parseAllNhiPenalties(texts: {
  dl75736?: string;
  dl75737?: string;
  dl75738?: string;
  dl87941?: string;
}, todayIso?: string): ParsedPenaltiesResult {
  const clinicPenalties = new Map<
    string,
    FacilityPenaltyInfo & {
      agencyCode: string;
      name: string;
      address?: string;
      region?: string;
    }
  >();
  const addressRecords: FacilityRecord[] = [];

  // Helper to normalize parsed row keys
  const getRows = (csvRaw?: string) => {
    if (!csvRaw) return [];
    const cleaned = cleanCsvText(csvRaw);
    const rawRows = parseCsv(cleaned);
    return rawRows.map((row) => {
      const normalized: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        normalized[normalizeKey(k)] = (v || "").trim();
      }
      return normalized;
    });
  };

  // 1. dl-75736: 違規情節重大名冊
  for (const row of getRows(texts.dl75736)) {
    const code = row["院所代號"] || row["代號"];
    const name = row["院所名稱"];
    if (!code || !name) continue;

    const startRaw = row["執行起日"] || "";
    const endRaw = row["執行迄日"] || "";
    const isSuspended = startRaw.includes("暫緩") || endRaw.includes("暫緩");
    const startDate = minguoToIsoDate(startRaw);
    const endDate = minguoToIsoDate(endRaw);
    const status = computePenaltyStatus(startDate, endDate, isSuspended, todayIso);

    clinicPenalties.set(code, {
      agencyCode: code,
      name,
      region: row["縣市地區"] || row["縣市"] || "",
      category: row["處分類別"] || "終止特約",
      reason: row["處分原由"] || "",
      clauses: row["處分條款"] || "",
      practitioner: row["負責醫事人員行為人"] || row["負責醫事人員"] || "",
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      rawMinguoRange: startRaw && endRaw ? `${startRaw} ~ ${endRaw}` : startRaw || endRaw || undefined,
      status,
      sourceTitle: "違規情節重大名冊",
    });
  }

  // 2. dl-75737: 停約名冊
  for (const row of getRows(texts.dl75737)) {
    const code = row["院所代號"] || row["代號"];
    const name = row["院所名稱"];
    if (!code || !name) continue;

    const startRaw = row["執行起日"] || "";
    const endRaw = row["執行迄日"] || "";
    const isSuspended = startRaw.includes("暫緩") || endRaw.includes("暫緩");
    const startDate = minguoToIsoDate(startRaw);
    const endDate = minguoToIsoDate(endRaw);
    const status = computePenaltyStatus(startDate, endDate, isSuspended, todayIso);

    // If already exists from 75736 (重大違規), prefer active or keep combined
    const existing = clinicPenalties.get(code);
    if (!existing || (existing.status === "expired" && status === "active")) {
      clinicPenalties.set(code, {
        agencyCode: code,
        name,
        region: row["縣市地區"] || row["縣市"] || "",
        category: row["處分類別"] || "停約處分",
        reason: row["處分原由"] || "",
        clauses: row["處分條款"] || "",
        practitioner: row["負責醫事人員行為人"] || row["負責醫事人員"] || existing?.practitioner || "",
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        rawMinguoRange: startRaw && endRaw ? `${startRaw} ~ ${endRaw}` : startRaw || endRaw || undefined,
        status,
        sourceTitle: "停約名冊",
      });
    }
  }

  // 4. dl-87941: 五年內不予特約之醫事機構及負責醫事人員
  for (const row of getRows(texts.dl87941)) {
    const code = row["代號"] || row["院所代號"];
    const name = row["院所名稱"];
    if (!code || !name) continue;

    const startRaw = row["執行起日"] || "";
    const endRaw = row["執行迄日"] || "";
    const isSuspended = startRaw.includes("暫緩") || endRaw.includes("暫緩");
    const startDate = minguoToIsoDate(startRaw);
    const endDate = minguoToIsoDate(endRaw);
    const status = computePenaltyStatus(startDate, endDate, isSuspended, todayIso);

    const county = row["縣市"] || "";
    const district = row["鄉鎮市區"] || "";
    const region = `${county}${district}`.trim();

    const existing = clinicPenalties.get(code);
    if (!existing) {
      clinicPenalties.set(code, {
        agencyCode: code,
        name,
        region,
        category: "五年不予特約",
        reason: "五年內不予健保特約之醫事機構及負責醫事人員管制。",
        practitioner: row["負責醫事人員"] || "",
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        rawMinguoRange: startRaw && endRaw ? `${startRaw} ~ ${endRaw}` : startRaw || endRaw || undefined,
        status,
        sourceTitle: "五年內不予特約名冊",
      });
    } else {
      if (!existing.practitioner && row["負責醫事人員"]) {
        existing.practitioner = row["負責醫事人員"];
      }
    }
  }

  // 3. dl-75738: 五年內不予特約之地址
  for (const row of getRows(texts.dl75738)) {
    const county = row["縣市"] || "";
    const district = row["鄉鎮市區"] || "";
    const rawAddress = row["地址"] || "";
    if (!rawAddress) continue;

    const fullAddress = normalizeAddress(`${county}${district}${rawAddress}`);
    const startRaw = row["執行起日"] || "";
    const endRaw = row["執行迄日"] || "";
    const isSuspended = startRaw.includes("暫緩") || endRaw.includes("暫緩");
    const startDate = minguoToIsoDate(startRaw);
    const endDate = minguoToIsoDate(endRaw);
    const status = computePenaltyStatus(startDate, endDate, isSuspended, todayIso);

    const addrHash = crypto.createHash("sha256").update(fullAddress).digest("hex").slice(0, 16);
    const penalty: FacilityPenaltyInfo = {
      status,
      category: "五年不予特約",
      reason: "依全民健康保險法規，此門牌地址於管制期間內，任何新設立之醫事機構均不予健保特約。",
      clauses: "全民健康保險醫事服務機構特約及管理辦法",
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      rawMinguoRange: startRaw && endRaw ? `${startRaw} ~ ${endRaw}` : startRaw || endRaw || undefined,
      sourceTitle: "五年內不予特約之地址",
    };

    addressRecords.push({
      facilityType: "clinic",
      sourceKey: "nhi_penalty",
      sourceId: `addr_${addrHash}`,
      name: `[健保管制地址] ${fullAddress}`,
      address: fullAddress,
      phone: null,
      lat: null,
      lng: null,
      serviceItem: "五年不予特約地址",
      serviceTime: null,
      dataOrg: "衛福部中央健康保險署",
      extra: { penalty },
    });
  }

  return { clinicPenalties, addressRecords };
}

/**
 * Downloads all 4 NHI CSV datasets, parses them, enriches existing clinics in MySQL,
 * and returns standalone clinic / address records for insertion into facilities.
 */
export async function fetchNhiPenalties(): Promise<FacilityRecord[]> {
  // Fetch the 4 CSV files via httpGetText
  const fetchSafe = async (url: string) => {
    try {
      const cleanUrl = url.trim().replace(/\/$/, "");
      const { status, text } = await httpGetText(cleanUrl);
      if (status >= 200 && status < 300) return text;
      console.warn(`NHI penalty CSV ${url} returned status ${status}`);
      return undefined;
    } catch (err) {
      console.warn(`NHI penalty CSV ${url} fetch failed:`, err);
      return undefined;
    }
  };

  const [dl75736, dl75737, dl75738, dl87941] = await Promise.all([
    fetchSafe(NHI_PENALTY_URLS.dl75736),
    fetchSafe(NHI_PENALTY_URLS.dl75737),
    fetchSafe(NHI_PENALTY_URLS.dl75738),
    fetchSafe(NHI_PENALTY_URLS.dl87941),
  ]);

  const { clinicPenalties, addressRecords } = parseAllNhiPenalties({
    dl75736,
    dl75737,
    dl75738,
    dl87941,
  });

  const standaloneRecords: FacilityRecord[] = [...addressRecords];

  // Try database enrichment if connection is available
  try {
    await withConnection(async (conn) => {
      const now = utcNowSql();

      for (const [code, item] of clinicPenalties.entries()) {
        const penaltyInfo: FacilityPenaltyInfo = {
          status: item.status,
          category: item.category,
          reason: item.reason,
          clauses: item.clauses,
          practitioner: item.practitioner,
          startDate: item.startDate,
          endDate: item.endDate,
          rawMinguoRange: item.rawMinguoRange,
          sourceTitle: item.sourceTitle,
          updatedAt: now,
        };

        // Check if matching clinic exists in database
        const [rows] = await conn.query<any[]>(
          "SELECT id, source_key, name, address, extra_json FROM facilities WHERE facility_type = 'clinic' AND source_id = ? LIMIT 1",
          [code],
        );

        if (rows.length > 0) {
          // Enrich existing active clinic
          await conn.query(
            "UPDATE facilities SET extra_json = JSON_SET(COALESCE(extra_json, '{}'), '$.penalty', CAST(? AS JSON)), updated_at = ? WHERE id = ?",
            [JSON.stringify(penaltyInfo), now, rows[0].id],
          );
        } else {
          // Clinic not in active registry (e.g. terminated or historical) — create standalone record
          const cleanAddr = item.region ? normalizeAddress(item.region) : null;
          standaloneRecords.push({
            facilityType: "clinic",
            sourceKey: "nhi_penalty",
            sourceId: code,
            name: item.name,
            address: cleanAddr,
            phone: null,
            lat: null,
            lng: null,
            serviceItem: "健保違規停約",
            serviceTime: null,
            dataOrg: "衛福部中央健康保險署",
            extra: { penalty: penaltyInfo },
          });
        }
      }
    });
  } catch (dbErr) {
    console.warn("Database enrichment skipped (offline or not configured):", dbErr);
    // If DB is offline, turn all clinic penalties into standalone records so caller gets the full dataset
    for (const [code, item] of clinicPenalties.entries()) {
      const penaltyInfo: FacilityPenaltyInfo = {
        status: item.status,
        category: item.category,
        reason: item.reason,
        clauses: item.clauses,
        practitioner: item.practitioner,
        startDate: item.startDate,
        endDate: item.endDate,
        rawMinguoRange: item.rawMinguoRange,
        sourceTitle: item.sourceTitle,
      };
      const cleanAddr = item.region ? normalizeAddress(item.region) : null;
      standaloneRecords.push({
        facilityType: "clinic",
        sourceKey: "nhi_penalty",
        sourceId: code,
        name: item.name,
        address: cleanAddr,
        phone: null,
        lat: null,
        lng: null,
        serviceItem: "健保違規停約",
        serviceTime: null,
        dataOrg: "衛福部中央健康保險署",
        extra: { penalty: penaltyInfo },
      });
    }
  }

  // Persist seed backup for offline fallback
  try {
    const seedDir = path.join(process.cwd(), "data", "facilities-seeds");
    if (!fs.existsSync(seedDir)) {
      fs.mkdirSync(seedDir, { recursive: true });
    }
    const seedFile = path.join(seedDir, "nhi-penalties.json");
    fs.writeFileSync(seedFile, JSON.stringify(standaloneRecords, null, 2), "utf-8");
  } catch (fsErr) {
    console.warn("Failed to write nhi-penalties seed backup:", fsErr);
  }

  return standaloneRecords;
}
