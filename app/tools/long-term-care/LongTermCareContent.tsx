"use client";

import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";

export default function LongTermCareContent() {
  return (
    <FacilitySearchContent
      config={{
        facilityType: "long_term_care",
        emoji: "🏡",
        title: "長照機構查詢",
        description: "查詢衛福部許可全台長期照顧服務機構。資料來源：衛福部長照服務地圖。",
        searchPlaceholder: "輸入機構名稱或縣市關鍵字",
        errorText: "查詢機構資料失敗，請稍後再試。",
        emptyStateNoKeyword: "附近查無收錄的長照機構，可改用關鍵字搜尋。",
        emptyStateWithKeyword: "查無符合的機構。",
      }}
    />
  );
}
