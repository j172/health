/**
 * TDX「高齡友善服務」(service category `seniors`, group 高齡友善出行資料服務
 * v1) — the base URL every Senior Rail / Tourism / SeniorCard call shares.
 *
 * Confirmed 2026-10-12 from TDX's own OpenAPI document for that group
 * (https://tdx.transportdata.tw/webapi/File/Swagger/V3/17214f64-de51-4246-b231-3c937d25d422,
 * listed under https://tdx.transportdata.tw/webapi/serviceCategory/ForSwagger):
 * `servers: [{ url: "https://tdx.transportdata.tw/api/seniors" }]` with paths
 * `/V1/Senior/...`. It is its own service category — neither `/api/basic` nor
 * `/api/advanced`, which is why every guess under those tiers 404'd (#434).
 * Note the upper-case `V1`.
 */
export const TDX_SENIORS_API_BASE = "https://tdx.transportdata.tw/api/seniors/V1/Senior";

/**
 * The Senior OpenAPI document types `PositionLon`/`PositionLat` as strings,
 * not numbers. Coerce before they reach a DECIMAL column: a numeric string
 * becomes a number, while an empty/blank string, a non-numeric value, or an
 * exact 0 (never a real coordinate in Taiwan, a common "unknown" filler)
 * becomes null instead of failing the INSERT in strict mode.
 */
export const parseTdxCoordinate = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim() || NaN) : NaN;
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
};
