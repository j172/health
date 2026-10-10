export interface SeniorCardSubsidyItem {
  category: string | null;
  description: string | null;
}

export interface SeniorCardEntry {
  county: string;
  cardName: string | null;
  infoUrl: string | null;
  subsidies: SeniorCardSubsidyItem[];
}

export interface TourismFacilityEntry {
  attractionName: string;
  county: string | null;
  category: string;
  facilityName: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
}

export interface TourismServiceEntry {
  attractionName: string;
  county: string | null;
  serviceName: string | null;
  description: string | null;
  serviceUrl: string | null;
  servicePhone: string | null;
}

export interface TourPackageEntry {
  packageName: string;
  description: string | null;
  bookingUrl: string | null;
  pictureUrl: string | null;
  issuingEntity: string | null;
}

export interface TourismAlertEntry {
  alertId: string;
  type: string | null;
  targetName: string | null;
  reason: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface SeniorFriendlyOverview {
  seniorCards: SeniorCardEntry[];
  tourismFacilities: TourismFacilityEntry[];
  tourismServices: TourismServiceEntry[];
  tourPackages: TourPackageEntry[];
  tourismAlerts: TourismAlertEntry[];
  counties: string[];
}
