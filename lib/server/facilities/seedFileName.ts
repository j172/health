/**
 * 設施種子檔名防護。
 *
 * `/api/facilities?type=<x>` 在資料庫沒資料時，會用 `data/facilities-seeds/<x>.json` 當後備。
 * `<x>` 來自網址參數，若不檢查，`type=../../package` 之類的值會讓路徑跳出該資料夾，讀到
 * 其他 `.json`。種子檔名只會是英數字、底線與連字號（例如 `adult_preventive_care`、
 * `vet-clinics-seed`），所以只接受這個集合；其餘一律視為「沒有種子」。
 */
const SAFE_SEED_FILE_STEM = /^[A-Za-z0-9_-]{1,64}$/;

export const isSafeSeedFileStem = (value: unknown): value is string =>
  typeof value === "string" && SAFE_SEED_FILE_STEM.test(value);
