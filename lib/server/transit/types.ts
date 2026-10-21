export type TransitSystemType =
  | "bus"
  | "metro"
  | "rail"
  | "hsrail"
  | "rehab_bus"
  | "accessible_taxi";

// One sample schedule/trip-level low-floor flag for a route (issue #467's
// "可以看到某條路線某個班次是否為低地板車" requirement) — sourced from TDX's
// GET /v3/Bus/Schedule/City/{City}, whose Timetable entries each carry their
// own IsLowFloor. issue #730 removed the daily bus sync that wrote it; the
// column is kept and rows that an earlier sync already wrote are still read
// back (frozen snapshot, not live).
export interface AccessibleTransitRouteTrip {
  tripId: string;
  departureTime?: string | null;
  isLowFloor: boolean;
}

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
  // "tdx_bus" only on rows an earlier TDX Basic Bus sync already wrote (that
  // sync was removed in issue #730); otherwise the hardcoded seed
  // (lib/server/transit/data/transitSeed.ts).
  source?: "seed" | "tdx_bus";
  // Small sample of this route's schedule-level low-floor flags — only set
  // for source: "tdx_bus" rows that had matching Schedule/City data (frozen).
  sampleTrips?: AccessibleTransitRouteTrip[];
}

// One TDX Senior/Rail facility detail (elevator/toilet/AED/etc.), kept
// alongside the plain string tag so a future detail page can show
// floor/description/coordinates without another API round-trip. See
// features_json's `{tags, items}` shape in lib/server/transit/queries.ts.
export interface AccessibleTransitFacilityItem {
  category: string; // e.g. "Elevators", "Toilets", "AEDs" — TDX's raw category key
  facilityName?: string | null;
  floorLevel?: string | null;
  description?: string | null;
  exitName?: string | null;
  platformName?: string | null;
  lat?: number | null;
  lng?: number | null;
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
  featureItems?: AccessibleTransitFacilityItem[];
  lat?: number | null;
  lng?: number | null;
  // "tdx_senior" only on rows an earlier TDX Senior/Rail sync already wrote
  // (removed in issue #730); otherwise seed data.
  source?: "seed" | "tdx_senior";
  stationId?: string | null;
}

export interface AccessibleTransitHotline {
  county: string;
  name: string;
  phone: string;
  serviceHours: string;
  description: string;
  eligibility: string;
}

export interface AccessibleTransitFacilityAlert {
  alertId: string;
  railSystem: string;
  stationName: string;
  facilityName?: string | null;
  reason?: string | null;
  description?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface TransitAccessibilityOverview {
  routes: AccessibleTransitRoute[];
  facilities: AccessibleTransitFacility[];
  hotlines: AccessibleTransitHotline[];
  alerts: AccessibleTransitFacilityAlert[];
  summary: {
    totalRoutes: number;
    avgLowFloorRatio: number;
    allLowFloorCount: number;
    rehabAgenciesCount: number;
    activeAlertCount: number;
  };
  counties: string[];
  systemTypes: TransitSystemType[];
}
