"use client";

import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";

export default function LtcContractedContent() {
  return (
    <FacilitySearchContent
      config={{
        facilityType: "ltc_contracted",
        emoji: "🤝",
        title: "長照特約服務機構查詢",
        description: "查詢衛福部長照2.0特約服務機構，涵蓋居家服務、日間照顧、喘息服務等契約服務項目。資料來源：衛福部長照服務資訊網。",
        searchPlaceholder: "輸入機構名稱或縣市關鍵字",
        errorText: "查詢機構資料失敗，請稍後再試。",
        emptyStateNoKeyword: "附近查無收錄的長照特約服務機構，可改用關鍵字搜尋。",
        emptyStateWithKeyword: "查無符合的機構。",
        serviceItem: { label: "特約服務項目：" },
      }}
    />
  );
}
