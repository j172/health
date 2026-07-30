"use client";

import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";

export default function PharmaciesContent() {
  return (
    <FacilitySearchContent
      config={{
        facilityType: "pharmacy",
        emoji: "🏪",
        title: "藥局查詢",
        description: "查詢全台一般藥局及健保特約藥局。資料來源：衛福部食藥署藥局管理系統、中央健康保險署。",
        searchPlaceholder: "輸入藥局名稱或地址關鍵字（縣市、鄉鎮）",
        radiusMeters: 5000,
        errorText: "查詢藥局資料失敗，請稍後再試。",
        emptyStateNoKeyword: "附近 5 公里內查無已定位的藥局，可改用關鍵字搜尋。",
        emptyStateWithKeyword: "查無符合的藥局。",
        serviceItem: "badge",
        showWeeklyHours: true,
        showGeocodeNote: true,
        locationDefaultWarning: "⚠️ 無法取得您的定位，附近搜尋改用預設位置範圍；您也可以直接用上方關鍵字搜尋全台藥局。",
      }}
    />
  );
}
