/**
 * Central registry for the eight AQX_* MOENV open-data datasets covered by
 * issue #131. Single source of truth for: which of the two payload shapes a
 * dataset uses (routes fetch/query/upsert to the right module + table),
 * plus the Chinese display name and update-frequency label the UI shows
 * next to every result so "測項/單位/更新頻率" (issue #131's acceptance
 * criterion) is always explicit rather than inferred from raw field names.
 *
 * "Wide" shape: one row per site+item+date, with 24 hourly value columns
 * (monitorvalue00..23). "Narrow" shape: one row per single reading, already
 * carrying its own concentration + timestamp. See lib/server/aqx/fetchAqxWide.ts
 * and fetchAqxNarrow.ts respectively.
 */
export type AqxDatasetShape = "wide" | "narrow";

export interface AqxDatasetMeta {
  code: string;
  shape: AqxDatasetShape;
  /** 資料集中文名稱，直接取自環境部開放資料平臺的資料集標題。 */
  nameZh: string;
  /** 更新頻率說明（顯示於工具頁，讓使用者知道資料多久更新一次）。 */
  updateFrequency: string;
}

export const AQX_DATASETS: Record<string, AqxDatasetMeta> = {
  aqx_p_15: {
    code: "aqx_p_15",
    shape: "wide",
    nameZh: "空氣品質監測小時值（一般污染物）",
    updateFrequency: "每日更新",
  },
  aqx_p_16: {
    code: "aqx_p_16",
    shape: "wide",
    nameZh: "BTEX 監測小時值",
    updateFrequency: "每日更新",
  },
  aqx_p_17: {
    code: "aqx_p_17",
    shape: "wide",
    nameZh: "非甲烷碳氫化合物（NMHC）監測小時值",
    updateFrequency: "每日更新",
  },
  aqx_p_18: {
    code: "aqx_p_18",
    shape: "wide",
    nameZh: "總碳氫化合物（THC）監測小時值",
    updateFrequency: "每日更新",
  },
  aqx_p_25: {
    code: "aqx_p_25",
    shape: "wide",
    nameZh: "光化測站小時值資料",
    updateFrequency: "每日更新",
  },
  aqx_p_318: {
    code: "aqx_p_318",
    shape: "narrow",
    nameZh: "CO 8 小時平均值",
    updateFrequency: "每日提供 17 筆",
  },
  aqx_p_319: {
    code: "aqx_p_319",
    shape: "narrow",
    nameZh: "PM10 小時值",
    updateFrequency: "每小時更新",
  },
  aqx_p_35: {
    code: "aqx_p_35",
    shape: "narrow",
    nameZh: "空氣品質監測小時值資料（其它測項）",
    updateFrequency: "每小時更新",
  },
};

export const AQX_WIDE_DATASET_CODES: string[] = Object.values(AQX_DATASETS)
  .filter((d) => d.shape === "wide")
  .map((d) => d.code);

export const AQX_NARROW_DATASET_CODES: string[] = Object.values(AQX_DATASETS)
  .filter((d) => d.shape === "narrow")
  .map((d) => d.code);

export const AQX_ALL_DATASET_CODES: string[] = [
  ...AQX_WIDE_DATASET_CODES,
  ...AQX_NARROW_DATASET_CODES,
];

export const getAqxDatasetMeta = (code: string): AqxDatasetMeta | null =>
  AQX_DATASETS[code] ?? null;
