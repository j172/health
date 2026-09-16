export type InundationAlertLevel = "normal" | "warning" | "critical";

export interface InundationSensorItem {
  sensorId: string;
  sensorName: string;
  county: string;
  township: string;
  address?: string | null;
  waterDepthCm: number;
  warningDepthCm: number;
  alertLevel: InundationAlertLevel;
  lat: number;
  lng: number;
  source: string;
  recordedAt: string;
}

export interface InundationShelterPoint {
  id: string;
  name: string;
  county: string;
  township: string;
  address: string;
  capacity: number;
  contactPhone: string;
  lat: number;
  lng: number;
}

export interface RiverWaterLevelAlert {
  stationId: string;
  stationName: string;
  riverName: string;
  county: string;
  currentWaterLevel: number;
  alertLevel: InundationAlertLevel;
  statusText: string;
  recordedAt: string;
}

export interface InundationMapOverview {
  sensors: InundationSensorItem[];
  riverAlerts: RiverWaterLevelAlert[];
  shelters: InundationShelterPoint[];
  summary: {
    totalSensors: number;
    normalCount: number;
    warningCount: number;
    criticalCount: number;
    riverAlertCount: number;
  };
  counties: string[];
}
