---
name: tw-opendata-geo
description: Query Taiwan geographic / geospatial datasets via Twinkle Hub MCP. 涵蓋村里界、行政區界、學區、選區、統計區、河川、道路、公共設施 geocode 等, 來自內政部地政司、營建署、統計處等。可用 lat/lon 點查找最近設施、城市鄉鎮坐標範圍、行政區查詢、TWD97 / WGS84 座標轉換 hint。Use for 地理空間分析 / 行政區劃 / 學區查詢 / 選區資料 / GIS / 公共設施 geocode / 距離篩選 / 商圈分析。繁體中文 corpus, geo_has_latlon / geo_has_twd97 在 catalog index 內標註。
license: Source data 政府資料開放授權條款-1版 (各機關). Skill itself Apache-2.0.
compatibility: Requires Twinkle Hub MCP endpoint with `search_datasets` (geo_has_latlon / geo_has_twd97 filter) + `query_rows`.
metadata:
  corpus: geo
  source: 內政部地政司、營建署、行政院統計處、各縣市政府
  language: zh-tw
  catalog_filters:
    - geo_has_latlon
    - geo_has_twd97
    - geo_latlon_columns
  version: "1.0.0"
---

# tw-opendata-geo — 地理空間資料

## Corpus 概況

`data.gov.tw` 全 53k datasets 中, ~5,000 個含地理座標。catalog index 內標註：
- `geo_has_latlon` (boolean) — 是否含 WGS84 經緯度
- `geo_has_twd97` (boolean) — 是否含 TWD97 X/Y 座標 (台灣本地座標系)
- `geo_latlon_columns` (string[]) — 哪個欄位是 lat / lon (常見：`緯度`/`經度`, `lat`/`lon`, `latitude`/`longitude`)
- `geo_twd97_columns` (string[]) — 同 above

## 何時用本 skill

「地理 / GIS / 經緯度 / 座標 / 行政區 / 鄉鎮 / 村里 / 學區 / 選區 / 距離 / 最近 / 商圈 / TWD97 / WGS84 / SHP / GeoJSON」相關時優先載入。**不適用於**：圖像地圖瀏覽 (用 Google Maps)、即時導航 (本 corpus 是靜態的)、外國地理。

## MCP Tools

### `search_datasets(query, ...)` — 找 geo dataset

```python
search_datasets(
    query="加油站",
    domain="geo_environment",  # 或不指定
    # geo filter 透過 catalog index attribute (不是 MCP 參數, 是 hint)
    limit=20,
)
```

回 hit 含 `geo_has_latlon`, `geo_latlon_columns` 等 hint 欄位。

### `query_rows(dataset_id, where, ...)` — SQL 查座標

```python
query_rows(
    dataset_id="123456",  # e.g. 加油站 dataset
    where="city='台北市'",
    columns=["name", "latitude", "longitude", "address"],
    limit=100,
)
```

可在 client side 用 haversine 公式找最近, 或如果 dataset 有 `district` 直接 SQL filter。

### `list_domains()` — 看相關 domains

`geo_environment` (15 anchor datasets, 環境地理) + 其他多 domain 也含 geo dataset。

## 常見 geo dataset 類型 + dataset_id 範例

| 類型 | 例子 (dataset_id) | 內容 |
|---|---|---|
| 行政區界 | 5958 等 SHP | 縣市界、鄉鎮界、村里界 |
| 學校 / 學區 | 教育部多個 dataset | 國中小高中位置 + lat/lon |
| 加油站 / 充電站 | 能源局 / 環境部 | 點座標 + 服務時間 |
| 河川 / 水利 | 經濟部水利署 | 河川中線 / 流域邊界 |
| 醫療院所 | 健保署 | 醫院、診所 lat/lon |
| 投票所 / 選區 | 中選會 | 投開票所位置 |
| 警察 / 消防 | 警政署 / 消防署 | 派出所 / 消防分隊 位置 |
| 公共設施 | 各縣市 | 公園、停車場、廁所、運動場 |
| 統計區 | 行政院統計處 | 一級統計區、最小統計區 |

## 範例 query

| 使用者問題 | 對應做法 |
|---|---|
| 「台北市所有 4 大超商 7-11 全家位置」 | `search_datasets("超商 便利商店", domain="economy_business")` 看是否有公開 (商業數據通常不全) |
| 「找新北市板橋區所有國小」 | `search_datasets("國民小學")` → 拿 dataset_id → `query_rows(...)` filter `district='板橋區'` |
| 「我家在 25.04, 121.55, 找最近的派出所」 | `query_rows(警政署 dataset, columns=["name","lat","lon","address"])` → 全撈, client 用 haversine 算最近 5 家 |
| 「2024 立委選區邊界」 | `search_datasets("立法委員 選舉區")` 找 SHP/GeoJSON, 是 GIS 圖層不是 row data |
| 「桃園市加油站」 | `search_datasets("加油站", domain="geo_environment")` → 找含 lat/lon 的 dataset → `query_rows(... WHERE city='桃園市')` |

## 座標系統知識

- **WGS84 (lat, lon)**: 國際通用, Google Maps / GPS 用這個, 範圍 (台灣) lat 21.8~25.4, lon 120.0~122.0
- **TWD97 (X, Y)**: 台灣本地座標, 單位是公尺。台灣本島 X 範圍 ~150,000~360,000, Y 範圍 ~2,420,000~2,800,000
- 兩者**不可直接互換**, 需透過 proj 套件轉換。catalog 標 `geo_has_twd97=True` 的 dataset 多為內政部、地政司資料
- 如果 dataset 同時有 `geo_has_latlon` + `geo_has_twd97`, 選 lat/lon (跨國工具相容)

## 最佳實踐

1. **先 `search_datasets` 看 geo_has_latlon hint**, 沒 lat/lon 的 dataset 不能直接做空間查詢
2. **行政區界 / 學區 dataset 通常是 SHP / GeoJSON**, 透過 `query_rows` 只能拿屬性表, 拿不到 geometry — 需要 download zip 自己處理
3. **距離篩選 client side 做**：DuckDB 沒有原生 spatial extension, haversine 用 SQL 寫 ok 但 client 也行
4. **TWD97 座標 不要當 lat/lon 用** — 數字看起來像但完全不同 scale
5. **`address` 欄位可作 fallback**：geocoding 用內政部 TGOS 服務或第三方 (本 skill 不負責)

## 注意事項

- 不少地理 dataset 是 SHP/KMZ 壓縮檔, `tw-opendata-general` 的 `materialize_dataset` 對純 SHP/KML 不會自動處理 (在 SKIP_FORMATS 內)。要拿 geometry 需自己 download + 解壓 + GDAL/QGIS
- 座標精度差異大: 商家 dataset 可能 ~10m 精度, 統計區可能 ~100m

## 與其他 skill 的邊界

- **房地產地址解析** → `tw-opendata-realestate` 用 city/district filter, 不靠 lat/lon
- **行政機關地理空間 dataset (河川/水利)** → 本 skill
- **天氣 / 氣象** → `tw-opendata-general` (中央氣象署 dataset)
