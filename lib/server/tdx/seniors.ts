/**
 * TDX「高齡友善服務」(service category `seniors`, group 高齡友善出行資料服務
 * v1) — the base URL shared by the Senior Rail (hourly elevator-outage alerts) and
 * SeniorCard (manual sync only) calls.
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

// issue #731：parseTdxCoordinate（PositionLon／PositionLat 字串轉座標）原本給樂齡旅遊與軌道
// 設施同步用，那些同步移除（#729／#730）後已沒有任何呼叫端，連同測試一併刪除。
