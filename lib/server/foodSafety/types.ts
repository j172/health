export type CropCategory =
  | "葉菜類"
  | "水果類"
  | "瓜果類"
  | "根莖類"
  | "豆菜類"
  | "香辛植物"
  | "其他";

export type PesticideRiskLevel = "low" | "moderate" | "high";

export interface TopPesticideInfo {
  name: string;
  purpose: string; // 殺菌劑 / 殺蟲劑 / 除草劑
  toxicity: string; // 毒理影響簡述
  typicalLimitPpm: number;
}

export interface FoodPesticideStandardItem {
  id?: number;
  category: CropCategory;
  cropName: string;
  cropNameEn?: string | null;
  commonNames?: string | null;
  passRate: number; // 官方質譜抽驗合格率 0~100
  sampleCount: number;
  riskLevel: PesticideRiskLevel;
  topPesticides: TopPesticideInfo[];
  washingGuide: string; // 農業部專家推薦黃金清洗指南
  seasonalMonths?: string | null; // 盛產月份 如 "11月-翌年4月"
  avgWholesalePrice?: number | null; // 元/公斤
}

export interface FoodPesticideRecordItem {
  id: number;
  cropName: string;
  originLocation: string | null;
  inspectionDate: string;
  pesticideName: string;
  detectedValue: number;
  standardLimit: number;
  overRatio: number;
  actionStatus: string | null;
}

export interface PesticideOverviewResult {
  standards: FoodPesticideStandardItem[];
  totalCrops: number;
  avgPassRate: number;
  safeCropCount: number;
  moderateCropCount: number;
  highRiskCropCount: number;
  categories: CropCategory[];
  updatedAt: string;
}
