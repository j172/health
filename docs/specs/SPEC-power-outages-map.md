# 規格書：台電電力維生管線即時停電災情與修復進度地圖（Power Outages Map）

- **建立日期**：2026-10-24
- **狀態**：Ready for Implementation (`ready-for-agent`)
- **關聯研究**：[`docs/2.0/opendata-expansion-research.md`](../2.0/opendata-expansion-research.md#L170-L187)（§2.4.1、§7 #1）
- **牽涉範疇**：新工具 `/tools/power-outages`、API `/api/power-outages`、KML 解析器、資料庫快取/In-memory SWR、維生管線雙向導流、單元測試

---

## 1. Problem Statement

在天災（颱風、暴雨、地震）或平時設備檢修、線路跳脫時，民眾遇到突然停電常面臨高度焦慮：
1. **未知規模與原因**：無法即時判斷是「自家總開關跳電」、「整棟大樓停電」還是「整個社區／村里停電」。
2. **通報電話塞車**：台電 1911 專線在突發跳電時常瞬間滿線，民眾無法得知「台電是否已派員搶修」與「預計何時能復電」。
3. **缺乏空間視覺化**：台電官網與停電查詢系統多以繁瑣的「電號」或下拉選單查詢，缺乏直觀的地理圖資邊界展示。

台電公司於政府資料開放平臺釋出「電力維生管線災情資訊」[44799]（代碼 `d006012`），提供 XML/KML 格式，含全臺即時停電行政區、停電村里、影響戶數、預計復電時間，並**內建村里停電空間多邊形經緯度（`<Polygon>`）**，是極高價值的民生防災維生資料。

---

## 2. Solution & Architecture

建立本站獨立維生工具 **`/tools/power-outages`（全臺即時停電災情與修復地圖）**：

1. **後端管線與 KML 解析**：
   - 上游端點：`https://service.taipower.com.tw/data/opendata/apply/file/d006012/001.xml`（備用 `001.kml`）。
   - 由 [`lib/server/power/outageService.ts`](file:///d:/GoogleDrive/health/lib/server/power/outageService.ts) 負責抓取與快取（SWR 60 秒至 3 分鐘）。
   - 解析 KML `<Placemark>`，擷取：
     - `county`（縣市，如嘉義縣）
     - `township`（鄉鎮市區，如朴子市）
     - `village`（村里，如竹村里）
     - `outageCount`（影響戶數）
     - `restoreTime`（預計復電時間）
     - `contactPhone`（1911）
     - `updateTime`（資料時間）
     - `geometry`: 將 `<Polygon><LinearRing><coordinates>` 轉換為 GeoJSON `Polygon` `[[[lng, lat], ...]]`。
2. **API 契約（`GET /api/power-outages`）**：
   ```ts
   export interface PowerOutageIncident {
     id: string;
     county: string;
     township: string;
     village: string;
     outageCount: number;
     restoreTime: string | null;
     contactPhone: string;
     updateTime: string;
     coordinates: [number, number][]; // [lng, lat]
   }

   export interface PowerOutagesResponse {
     totalOutageCount: number;
     affectedVillagesCount: number;
     countySummaries: { county: string; outageCount: number; count: number }[];
     incidents: PowerOutageIncident[];
     updatedAt: string;
   }
   ```
3. **前端視覺化與互動（`/tools/power-outages`）**：
   - 頂部統計指標卡：全臺即時停電總戶數、受影響村里數、主要停電縣市。
   - Leaflet 地圖：以半透明紅色/橙色多邊形高亮停電村里邊界，點擊彈窗展示停電村里名稱、影響戶數、預計復電時間與 1911 直撥按鈕。
   - 側邊/下方清單：提供縣市鄉鎮快速篩選與文字搜尋。
4. **維生管線三聯動情境導流**：
   - 在本頁面底部提供友善引流卡片，連結至既有：
     - 水利署停水地圖：[`/tools/water-outages`](file:///d:/GoogleDrive/health/app/%28zh%29/tools/water-outages/page.tsx)
     - 全台電力概況儀表板：[`/tools/power-grid-overview`](file:///d:/GoogleDrive/health/app/%28zh%29/tools/power-grid-overview/page.tsx)
     - 防災指南專題：[`/guides/typhoon-earthquake`](file:///d:/GoogleDrive/health/app/%28zh%29/guides/typhoon-earthquake/page.tsx)

---

## 3. Testing Strategy

1. **單元測試 (`tests/power-outages-parser.test.mjs`)**：
   - 測試 KML XML 空值、單一多邊形、多重多邊形座標解析。
   - 測試民國年/西元年時間字串轉換與無預計復電時間防護。
   - 測試統計指標彙總（totalOutageCount、countySummaries）。
2. **端點測試**：
   - 驗證 `/api/power-outages` 回傳標準結構與快取標頭。

