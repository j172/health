export interface EmergencyWaterStation {
  stationId: string;
  name: string;
  address: string;
  county: string;
  township: string;
  lat: number;
  lng: number;
  operatingHours: string;
  waterType: "water_tank" | "water_truck" | "hydrant";
  contactPhone?: string;
}

export interface WaterOutageItem {
  id: string;
  outageId: string;
  title: string;
  county: string;
  township: string;
  outageType: "planned" | "emergency";
  startTime: string;
  endTime: string;
  affectedAreas: string;
  affectedHouseholds: number;
  contactPhone?: string;
  status: "active" | "scheduled" | "resolved";
  lat?: number;
  lng?: number;
  waterStations: EmergencyWaterStation[];
  source: string;
  updatedAt: string;
}

export interface WaterOutagesOverview {
  activeOutages: WaterOutageItem[];
  scheduledOutages: WaterOutageItem[];
  resolvedOutages: WaterOutageItem[];
  waterStations: EmergencyWaterStation[];
  summary: {
    totalActiveOutages: number;
    totalAffectedHouseholds: number;
    emergencyCount: number;
    plannedCount: number;
    totalWaterStations: number;
  };
  counties: string[];
}
