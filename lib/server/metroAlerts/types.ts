/**
 * All rail alert sources this tool covers (issue #470): the 6 TDX-confirmed
 * Metro/light-rail `RailSystem` codes for `/v2/Rail/Metro/Alert/{RailSystem}`
 * (docs/2.0/spec-issue-438.md §P T4) plus TRA and THSR, each with their own
 * dedicated TDX endpoint. `systemCode`/`systemLabel` default to TRTC/臺北捷運
 * on legacy rows (pre-#470 data.taipei-only rows never had these columns) so
 * every existing row keeps displaying correctly after migration.
 */
export type RailAlertSystemCode =
  | "TRTC"
  | "TRTCMG"
  | "TYMC"
  | "TMRT"
  | "KRTC"
  | "KLRT"
  | "TRA"
  | "THSR";

export interface MetroAlertItem {
  id?: number;
  externalId: string;
  lineName: string;
  stationName: string;
  alertTitle: string;
  alertContent: string;
  alertType: "elevator" | "operational" | "suspended" | string;
  alertTime: string;
  status: string;
  systemCode?: RailAlertSystemCode | string;
  systemLabel?: string;
}
