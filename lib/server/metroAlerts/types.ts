export interface MetroAlertItem {
  id?: number;
  externalId: string;
  lineName: string;
  stationName: string;
  alertTitle: string;
  alertContent: string;
  alertType: "elevator" | "operational" | string;
  alertTime: string;
  status: string;
}
