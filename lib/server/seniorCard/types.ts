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

export interface SeniorCardOverview {
  seniorCards: SeniorCardEntry[];
  counties: string[];
}
