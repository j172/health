# 氣象站觀測時間（obs_time）永遠凍結在第一次寫入的時間

- **作者**：Claude（診斷會話）
- **日期**：2026-09-21
- **狀態**：Draft
- **對應使用者回報**：「3. 即時在地天氣一直都是舊資料」

## 1. 診斷結果（已確認根因，請直接修，不用重新調查後端排程或前端刷新邏輯）

先前已有一份規格 `docs/specs/weather-widget-stale-and-precision-bug-fix.md`（PR #345，已於 2026-09-20 合併）修掉了前端「只抓一次不自動刷新」與「距離數字沒格式化」兩個問題。**這是另一個、獨立的、當時沒被發現的後端資料庫寫入 bug**，PR #345 上線後使用者仍持續回報看到舊資料，這次重新從即時 API 回應往回查才找到。

### 重現方式

直接打 production API，比對三個不同縣市的測站觀測時間，發現全部卡住、且卡在不同日期（證明不是單一測站故障，是系統性寫入問題）：

```
GET https://health.j172.tw/api/weather-nearby?lat=25.0384&lng=121.5637  → 信義站 obs_time: 2026-08-30T10:00:00.000Z
GET https://health.j172.tw/api/weather-nearby?lat=22.6273&lng=120.3014  → 新興站 obs_time: 2026-08-28T21:00:00.000Z
GET https://health.j172.tw/api/weather-nearby?lat=24.1477&lng=120.6736  → 臺中站 obs_time: 2026-08-20T13:00:00.000Z
```

同一支 API 回應裡的 `rainfall.observedAt` 三個縣市都是當天最新（`2026-09-21T01:00:00.000Z`），證明後端 cron（`runCwaSync`，`lib/server/cron/registerJobs.ts` 註冊，每小時 `:15`/`:45` 執行）確實有在跑、資料庫連線也正常，**只有 `cwa_station_weather` 這張表的 `obs_time` 欄位沒有被正確更新**。

### 根因

`lib/server/cwa/queries.ts` 第 262-289 行 `upsertCwaStationWeather`：

```sql
INSERT INTO cwa_station_weather
   (dataset_id, station_id, station_name, county_name, town_name, lat, lng, altitude, obs_time, weather,
    precipitation, wind_direction, wind_speed, air_temperature, relative_humidity, air_pressure, uv_index,
    peak_gust_speed, visibility_description, sunshine_duration, synced_at, created_at, updated_at)
 VALUES ?
 ON DUPLICATE KEY UPDATE
   station_name = VALUES(station_name),
   county_name = VALUES(county_name),
   town_name = VALUES(town_name),
   lat = VALUES(lat),
   lng = VALUES(lng),
   altitude = VALUES(altitude),
   weather = VALUES(weather),
   precipitation = VALUES(precipitation),
   wind_direction = VALUES(wind_direction),
   wind_speed = VALUES(wind_speed),
   air_temperature = VALUES(air_temperature),
   relative_humidity = VALUES(relative_humidity),
   air_pressure = VALUES(air_pressure),
   uv_index = VALUES(uv_index),
   peak_gust_speed = VALUES(peak_gust_speed),
   visibility_description = VALUES(visibility_description),
   sunshine_duration = VALUES(sunshine_duration),
   synced_at = VALUES(synced_at),
   updated_at = VALUES(updated_at)
```

`INSERT` 欄位清單裡有 `obs_time`，但 `ON DUPLICATE KEY UPDATE` 子句**漏掉了 `obs_time = VALUES(obs_time)`**。同一個 `(dataset_id, station_id)` 每 30 分鐘同步一次都會走 UPDATE 分支，其他欄位（溫度、天氣狀況等）都有正常更新，唯獨 `obs_time` 永遠停留在該筆資料第一次被 INSERT 時的值——三個測站卡在不同日期，剛好對應各自第一次被寫入資料庫的時間，不是三個測站剛好同時故障。

### 對前端的影響

`getNearestStationWeather`（同檔案第 334-381 行）沒有依 `obs_time` 做新鮮度過濾，只是抓最近的測站回傳，所以 `weather`/`air_temperature` 等數值理論上仍是最新的。但 `components/Tools/WeatherRainfallLocator.tsx` 第 281-284 行會直接把這個凍結的 `obs_time` 顯示成「觀測時間：HH:MM」（只顯示時分、不顯示日期），使用者看到這個時間點永遠不會前進，因此判斷「資料一直沒有更新」——這正是使用者這次回報的體感來源。

## 2. 待辦事項

1. 在 `lib/server/cwa/queries.ts` 的 `upsertCwaStationWeather` 的 `ON DUPLICATE KEY UPDATE` 子句補上一行 `obs_time = VALUES(obs_time)`。
2. 檢查同檔案裡其他 `upsertCwa*`／`upsertMoenv*` 函式（`upsertCwaRainfall`、`upsertCwaDailyRainfall`、`upsertCwaUvIndex`、`upsertCwaForecasts`、`upsertCwaAlerts`、`upsertCwaTownshipHazards` 等）是否有同樣「INSERT 欄位有但 UPDATE 子句漏寫」的模式，若有一併修正；若確認都正常，在 PR 說明中列出已檢查過、沒問題的函式清單。
3. 修完後用生產環境唯讀方式驗證（例如重新呼叫 `/api/weather-nearby` 觀察 `stationWeather.obs_time` 在下一次 cron 執行後是否會前進；不要直接寫入或修改生產資料庫資料本身）。

## 3. 驗收標準

- `upsertCwaStationWeather` 的 UPDATE 子句包含 `obs_time = VALUES(obs_time)`。
- 說明是否有其他 `upsertCwa*` 函式有同樣缺陷（有則一併修正，無則說明已檢查）。
- `npm test` 通過。
- PR 說明附上修復前後 API 回應比對（或至少說明如何驗證這行修正會讓 `obs_time` 隨下次同步前進）。
