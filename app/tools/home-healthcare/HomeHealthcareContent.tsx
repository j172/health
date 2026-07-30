"use client";

import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";

export default function HomeHealthcareContent() {
  return (
    <FacilitySearchContent
      config={{
        facilityType: "home_healthcare",
        emoji: "🏠",
        title: "居家醫療查詢",
        description: "查詢提供居家醫療照護服務的全民健保特約機構。資料來源：衛福部中央健康保險署。",
        searchPlaceholder: "輸入機構名稱或縣市關鍵字",
        errorText: "查詢機構資料失敗，請稍後再試。",
        emptyStateNoKeyword: "附近查無收錄的機構，可改用關鍵字搜尋。",
        emptyStateWithKeyword: "查無符合的機構。",
        serviceItem: "badge",
      }}
    />
  );
}
