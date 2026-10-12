# Specification: 台灣中油（CPC）全品項牌價查詢、20 大服務據點地圖與首頁側邊欄小卡整合

## 0. 背景與範圍

本規格整合台灣中油股份有限公司（CPC）開放資料平台之 9 大牌價與成本資料集、20 大加油站服務據點資料集，掛載於本站「便民服務（`group: "public-facility"`）」分類與「首頁側邊欄」，提供全台民眾高可用性、即時、直覺的油氣牌價查詢與加油站多功能服務地圖。

## 1. 架構設計與路由規劃

依據 Grill 深度對齊共識，採「雙獨立工具」與「首頁即時小卡」架構：
1. **中油各式油氣牌價查詢**：
   - 路由：`/tools/cpc-prices`
   - 目錄：`TOOL_CATALOG`（`group: "public-facility"`）
   - 形態：儀表板與多分類資料表格，收錄 9 大類產品共 150 筆牌價與歷史氣源成本。
2. **中油加油站服務據點地圖**：
   - 路由：`/tools/cpc-stations`
   - 目錄：`TOOL_CATALOG`（`group: "public-facility"`）
   - 形態：Leaflet 互動地圖與列表，聚合 20 份服務據點資料集至全台 644 座加油站，支援多標籤交集過濾。
3. **首頁側邊欄即時油氣小卡**：
   - 組件：`CpcPriceSidebarWidget.tsx`
   - 位置：`NewsSidebar.tsx` 之生活即時條件組中。
   - 呈現：4 宮格核心牌價（95/92/98/超級柴油）＋天然氣度數牌價＋當期生效日＋直連完整牌價頁。

---

## 2. 資料來源與擷取管線 (Data Ingestion Pipeline)

### 2.1 牌價與成本資料（9 項）

| 序號 | 資料集名稱 | 格式 | 來源端點 | 說明 |
|---|---|---|---|---|
| 1 | 主要產品牌價 | JSON | `https://vipmbr.cpc.com.tw/openData/MainProdListPrice` | 98/95/92 無鉛、超級柴油、燃料油等 |
| 2 | 天然氣牌價 | JSON | `https://vipmbr.cpc.com.tw/openData/NaturalGasListPrice` | 天然氣(1)、(2) 各分區工業與公用氣價 |
| 3 | 燃料油牌價 | JSON | `https://vipmbr.cpc.com.tw/openData/FuelOilListPrice` | 特種低硫、一般低硫燃料油 |
| 4 | 中油生技/酒類 | XML | `https://vipmbr.cpc.com.tw/CPCSTN/ListPriceWebService_Liquor.asmx/getCPCLiquorListPrice_XML` | 中油生技產品、清潔溶劑與酒品牌價 |
| 5 | 液化石油氣牌價 | JSON | `https://vipmbr.cpc.com.tw/openData/LPGListPrice` | 桶裝瓦斯、車用與工業 LPG 牌價 |
| 6 | 海運用油牌價 | JSON | `https://vipmbr.cpc.com.tw/openData/MarineFuelListPrice` | 漁船與商船用海運柴油/重油 |
| 7 | 航空燃油牌價 | JSON | `https://vipmbr.cpc.com.tw/openData/AviationFuelListPrice` | 航空汽油與噴射燃油 |
| 8 | 六大類油品牌價 | JSON | `https://vipmbr.cpc.com.tw/openData/SixtypeOilListPrice` | 去漬油、潤滑油等六大類產品 |
| 9 | LNG 氣源成本 | CSV | `https://www3.cpc.com.tw/opendata_l00/液化天然氣氣源成本.csv` | 歷年每月液化天然氣氣源成本 |

### 2.2 加油站各項服務據點資料（20 項，以 `站代號` 聚合）

所有站點資料皆以中油唯一識別碼 `站代號` 聚合為單一站點（`cpc_gas_station`），避免同地點產生多重 Marker：

- **輪胎充氣**：`inflationstn.asmx/getinflationstnData_XML` (XML)
- **電動機車充電**：`ElectricMotorcycleChargingStn` (JSON)
- **電動機車換電**：`ElectricMotorcycleBatterySwappingStn` (JSON)
- **電動機車充換電**：`electricmotoData` (JSON)
- **汽車電動車充電**：`台灣中油股份有限公司_提供電動車充電服務加油站.csv` (CSV)
- **五合一複合服務**：`5typeservicestn` (JSON)
- **外租快充樁**：`台灣中油股份有限公司_土地出租給充電樁業者營運加油站.csv` (CSV)
- **洗車服務**：`stnwithwashservice.asmx/getwashservicedata_XML` (XML)
- **Cup Go 來速咖啡**：`cupgo.asmx/getcupgoData_XML` (XML)
- **數位電子打氣機**：`Electronicinflation.asmx/getElectronicinflationData_XML` (XML)
- **加水服務**：`addwaterstn.asmx/getaddwaterstnData_XML` (XML)
- **代收停車費**：`collectparkingfee.asmx/getcollectparkingfeeData_XML` (XML)
- **吸塵器**：`SuctionMachineStn` (JSON)
- **廢機油回收**：`OilRecycleStn` (JSON)
- **eTag 服務**：`etag.asmx/getetagData_XML` (XML)
- **無障礙廁所**：`Accessibletoilets.asmx/getAccessibletoiletsData_XML` (XML)
- **複合商店**：`VarietyShopStn` (JSON)
- **自助柴油**：`SelfServeDieselStn` (JSON)
- **自助汽油**：`SelfServeGasolineStn` (JSON)
- **一卡通**：`ipassCard.asmx/getipassCardData_XML` (XML)
- **悠遊卡**：`EasyCard.asmx/getEasyCardData_XML` (XML)

---

## 3. 資料建模與儲存架構

### 3.1 牌價資料表 `cpc_prices`
```sql
CREATE TABLE IF NOT EXISTS cpc_prices (
  id BIGINT NOT NULL AUTO_INCREMENT,
  category VARCHAR(64) NOT NULL,
  product_code VARCHAR(64) NULL,
  product_name VARCHAR(128) NOT NULL,
  package_type VARCHAR(64) NULL,
  target_customer VARCHAR(128) NULL,
  delivery_point VARCHAR(256) NULL,
  unit VARCHAR(32) NOT NULL,
  price DECIMAL(10, 4) NOT NULL,
  tax_desc VARCHAR(64) NULL,
  goods_tax VARCHAR(64) NULL,
  effective_date VARCHAR(32) NULL,
  remark TEXT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  synced_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cpc_price_prod (category, product_code, product_name, package_type, delivery_point(100), effective_date),
  KEY idx_cpc_price_cat (category),
  KEY idx_cpc_price_eff (effective_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.2 加油站據點聚合儲存
統一使用既有 `facilities` 資料表：
- `facility_type`: `'cpc_gas_station'`
- `source_key`: `'cpc_stations'`
- `source_id`: `站代號` (例如 `D2046`)
- `service_item`: 逗號分隔之全部可用服務項目清單（支援 SQL `LIKE %服務%` 檢索）
- `extra_json`:
  ```json
  {
    "stationCode": "D2046",
    "postalCode": "207",
    "services": ["洗車服務", "輪胎充氣", "數位電子打氣機", "自助汽油", "悠遊卡", "一卡通"],
    "serviceHours": {
      "洗車服務": "09:00-17:00",
      "輪胎充氣": "00:00-24:00"
    },
    "landArea": "1787.07",
    "dataOrg": "台灣中油股份有限公司"
  }
  ```

### 3.3 離線備援種子檔 (Offline Seeds)
- `data/cpc-prices-seed.json` (150 筆)
- `data/facilities-seeds/cpc_gas_station.json` (644 座)

---

## 4. 前端組件與使用者體驗 (UX)

1. **牌價頁面 (`/tools/cpc-prices`)**：
   - 頂部大字體 Hero 卡片（95/92/98/柴油/天然氣）。
   - 分類 Tab 切換（全部、汽柴油、天然氣、燃料油、海運航空、酒類生技、六大類、氣源成本）。
   - 全文檢索與金額高低排序。
2. **地圖頁面 (`/tools/cpc-stations`)**：
   - 熱門服務快捷按鈕（洗車、自助、充電、換電、咖啡、電子票證）。
   - 20 項細部服務展開面板（多選交集篩選）。
   - Leaflet 地圖圖釘自適應定位與站點卡片聯動。
   - 支援 GPS 定位距離排序（公里）與 Google Maps 導航直連。
3. **首頁側邊欄 (`CpcPriceSidebarWidget.tsx`)**：
   - 4 宮格迷你卡展示核心油價與天然氣，顯示當期生效日與直連連結。

---

## 5. 驗收標準與驗證

1. `npm run typecheck` 零錯誤通過。
2. `npm test` 全站 229 項測試通過（包含新增的 CPC 種子與工具數量檢查）。
3. API 端點驗證：
   - `GET /api/cpc-prices?summary=true` 回傳 HTTP 200 與核心油價物件。
   - `GET /api/cpc-stations?limit=3` 回傳 HTTP 200 與聚合站點資料。
4. 網頁渲染驗證：
   - `/tools/cpc-prices` 正常載入，分類切換流暢。
   - `/tools/cpc-stations` 地圖標記渲染正確，篩選器正確過濾站點。
   - 首頁側邊欄小卡正確顯示。
