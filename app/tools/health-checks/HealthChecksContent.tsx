"use client";

import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";

export default function HealthChecksContent() {
  return (
    <FacilitySearchContent
      config={{
        facilityType: "health_check",
        emoji: "🩻",
        title: "健康檢查機構查詢",
        description: "查詢勞工健康檢查認可醫療機構及職業傷病防治網絡醫院。資料來源：勞動部。",
        noteLine: "⚠️ 老人免費健檢機構資料源目前無法連線，暫未收錄。",
        searchPlaceholder: "輸入機構名稱或縣市關鍵字",
        errorText: "查詢機構資料失敗，請稍後再試。",
        emptyStateNoKeyword: "附近查無已定位的機構，可改用關鍵字搜尋。",
        emptyStateWithKeyword: "查無符合的機構。",
        serviceItem: { label: "認可項目：" },
        showGeocodeNote: true,
      }}
    />
  );
}
