"use client";

import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";

export default function ClinicsContent() {
  return (
    <FacilitySearchContent
      config={{
        facilityType: "clinic",
        emoji: "🏥",
        title: "醫療院所查詢",
        description: "查詢全民健保特約醫療院所。資料來源：衛福部中央健康保險署（目前收錄醫學中心、區域醫院、地區醫院）。",
        searchPlaceholder: "輸入院所名稱或縣市關鍵字",
        errorText: "查詢院所資料失敗，請稍後再試。",
        emptyStateNoKeyword: "附近查無已定位的院所，可改用關鍵字搜尋。",
        emptyStateWithKeyword: "查無符合的院所。",
        serviceItem: "badge",
        showWeeklyHours: true,
      }}
    />
  );
}
