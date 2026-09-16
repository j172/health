export type CongestionLevel = "normal" | "busy" | "critical";

export interface EmergencyRoomItem {
  id?: number;
  hospital_code: string;
  hospital_name: string;
  city_code: string;
  city_name: string;
  area_name?: string | null;
  address?: string | null;
  phone?: string | null;
  lat?: number | null;
  lng?: number | null;
  hospital_level: string;
  waiting_consultation: number;
  waiting_bed: number;
  waiting_admission: number;
  waiting_icu: number;
  is_full_reported: boolean;
  full_reported_note?: string | null;
  congestion_level: CongestionLevel;
  reported_at: string;
  updated_at?: string;
  distance_km?: number;
  trend_sparkline?: number[];
  trend_direction?: "up" | "down" | "flat";
}

export interface EmergencyRoomLogItem {
  id: number;
  hospital_code: string;
  waiting_consultation: number;
  waiting_bed: number;
  waiting_admission: number;
  waiting_icu: number;
  is_full_reported: boolean;
  congestion_level: CongestionLevel;
  reported_at: string;
}

export interface EmergencyOverviewResult {
  ok: boolean;
  totalHospitals: number;
  criticalCount: number;
  busyCount: number;
  normalCount: number;
  fullReportedCount: number;
  updatedAt: string;
  items: EmergencyRoomItem[];
}
