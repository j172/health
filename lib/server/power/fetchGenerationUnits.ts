import { httpGetText } from "@/lib/server/net/httpClient";
import type { GenerationUnitRecord } from "./types";

// 台電開放資料 d006001 — 台灣電力公司各機組發電量即時資訊（含外購電力）,
// updates ~every 10 minutes. Confirmed live via a GitHub Actions egress probe
// (databaseId 34370655418): top-level `{DateTime, aaData: [...215 rows]}`,
// every field in a row is a STRING (parse them). See
// docs/specs/taipower-energy-dashboard.md.
const GENERATION_UNITS_URL =
  "https://service.taipower.com.tw/data/opendata/apply/file/d006001/001.json";

interface RawUnitRow {
  機組類型?: string;
  機組名稱?: string;
  "裝置容量(MW)"?: string;
  "淨發電量(MW)"?: string;
  "淨發電量/裝置容量比(%)"?: string;
  備註?: string;
}

interface RawPayload {
  DateTime?: string;
  aaData?: RawUnitRow[];
}

const parseNum = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const cleaned = v.replace(/%/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const toMysqlDatetime = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const s = raw.trim().replace("T", " ");
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) ? s.slice(0, 19) : null;
};

export async function fetchGenerationUnits(): Promise<GenerationUnitRecord[]> {
  const { status, text } = await httpGetText(GENERATION_UNITS_URL, { timeoutMs: 20_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`Taipower d006001 request failed: HTTP ${status}`);
  }

  const data = JSON.parse(text) as RawPayload;
  const sourceDatetime = toMysqlDatetime(data.DateTime);
  const rows = Array.isArray(data.aaData) ? data.aaData : [];

  return rows
    .map((row): GenerationUnitRecord | null => {
      const unitName = (row.機組名稱 ?? "").trim();
      const unitType = (row.機組類型 ?? "").trim();
      if (!unitName || !unitType) return null;

      const remark = (row.備註 ?? "").trim();
      return {
        unitName,
        unitType,
        capacityMw: parseNum(row["裝置容量(MW)"]),
        netGenerationMw: parseNum(row["淨發電量(MW)"]),
        capacityRatioPct: parseNum(row["淨發電量/裝置容量比(%)"]),
        remark: remark || null,
        sourceDatetime,
      };
    })
    .filter((r): r is GenerationUnitRecord => r !== null);
}
