"use client";

import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";

export default function HakkaCommunityContent() {
  return (
    <FacilitySearchContent
      config={{
        facilityType: "hakka_community",
        emoji: "🏘️",
        title: "客庄社區發展協會查詢",
        description: "查詢客家委員會客庄社區發展協會名冊。資料來源：客家委員會開放資料。",
        searchPlaceholder: "輸入協會名稱或縣市關鍵字",
        errorText: "查詢協會資料失敗，請稍後再試。",
        emptyStateNoKeyword: "附近查無收錄的客庄社區發展協會，可改用關鍵字搜尋。",
        emptyStateWithKeyword: "查無符合的協會。",
      }}
    />
  );
}
