export interface DebrisFlowAlertItem {
  debrisId: string;
  streamCode: string;
  streamName: string;
  county: string;
  township: string;
  village?: string;
  alertLevel: "yellow" | "red";
  rainfallThresholdMm?: number;
  advisory: string;
  lat: number;
  lng: number;
  issuedAt: string;
}

export interface DebrisFlowOverview {
  alerts: DebrisFlowAlertItem[];
  summary: {
    totalAlerts: number;
    redCount: number;
    yellowCount: number;
    countiesAffected: number;
  };
  counties: string[];
  updatedAt: string;
}
