export type OutdoorSafetyLevel = "excellent" | "good" | "caution" | "hazardous";
export type HeatRiskLevel = "safe" | "caution" | "warning" | "danger";

export interface GroupAdvisories {
  runner: {
    score: number;
    bestWindow: string; // 最佳跑步時段，如 "05:30 - 08:00"
    statusText: string;
    tips: string;
  };
  family: {
    score: number;
    statusText: string;
    parkRecommendation: string;
    uvCaution: string;
    diseaseNote: string;
  };
  elderly: {
    score: number;
    statusText: string;
    heatIndexWarning: string;
    cardioCaution: string;
  };
  mosquito: {
    riskText: string;
    repellentAdvice: string;
  };
}

export interface CityOutdoorSafetyItem {
  cityCode: string;
  cityName: string;
  overallScore: number; // 0 ~ 100
  safetyLevel: OutdoorSafetyLevel;
  heatRiskLevel: HeatRiskLevel;
  heatIndex: number;
  aqiValue: number;
  pm25Value: number;
  uvIndex: number;
  temperature: number;
  humidity: number;
  advisories: GroupAdvisories;
  tips: string[];
  updatedAt: string;
}

export interface OutdoorSafetyOverviewResult {
  cities: CityOutdoorSafetyItem[];
  nationalAvgScore: number;
  bestCity: { name: string; score: number };
  cautionCount: number;
  updatedAt: string;
}
