export type TransitSystemType =
  | "bus"
  | "metro"
  | "rail"
  | "hsrail"
  | "rehab_bus"
  | "accessible_taxi";

export interface AccessibleTransitRoute {
  id?: number;
  county: string;
  routeId: string;
  routeName: string;
  operatorName: string;
  lowFloorRatio: number; // 0 ~ 100 (%)
  isAllLowFloor: boolean;
  wheelchairSlots: number;
  description?: string | null;
}

export interface AccessibleTransitFacility {
  id?: number;
  county: string;
  systemType: TransitSystemType;
  stationOrAgency: string;
  facilityName: string;
  servicePhone?: string | null;
  bookingRules?: string | null;
  features: string[]; // ["無障礙電梯", "輪椅坡道", "輪椅充電座", "點字引導", "視障語音"]
  lat?: number | null;
  lng?: number | null;
}

export interface AccessibleTransitHotline {
  county: string;
  name: string;
  phone: string;
  serviceHours: string;
  description: string;
  eligibility: string;
}

export interface TransitAccessibilityOverview {
  routes: AccessibleTransitRoute[];
  facilities: AccessibleTransitFacility[];
  hotlines: AccessibleTransitHotline[];
  summary: {
    totalRoutes: number;
    avgLowFloorRatio: number;
    allLowFloorCount: number;
    rehabAgenciesCount: number;
  };
  counties: string[];
  systemTypes: TransitSystemType[];
}
