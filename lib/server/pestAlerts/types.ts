export interface PestAlertItem {
  id?: number;
  subjectName: string;
  monitorType: string;
  alertTime: string;
  targetCrops: string;
  warningLevel?: string;
  alertDataJson?: string;
  status: string;
}

export interface PestSurveyRecord {
  SurveyDate: string;
  CountyName: string;
  TownName: string;
  SurveySiteID: string;
  Lon?: string;
  Lat?: string;
  CropName?: string;
}
