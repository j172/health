/**
 * The 10 TDX Senior/Rail RailSystem codes (issue #434 / docs/archive/specs/
 * tdx-senior-rail-accessibility-upgrade.md section 2): 臺鐵、高鐵、四個都會捷運、
 * 兩個輕軌系統、新北捷運與臺北捷運。
 *
 * issue #730：每日軌道無障礙同步（含 Basic Station 站點縣市對照）已移除，
 * 這個檔案只剩給每小時電梯停用公告迴圈用的系統代碼。
 * issue #731：原檔名 railStationCounty.ts 已不符內容（站點縣市對照早已移除），改名 railSystems.ts。
 */
export const RAIL_SYSTEMS = [
  "TRA",
  "THSR",
  "TRTC",
  "NTMC",
  "TYMC",
  "TMRT",
  "KRTC",
  "KLRT",
  "NTDLRT",
  "NTALRT",
] as const;

export type RailSystem = (typeof RAIL_SYSTEMS)[number];
