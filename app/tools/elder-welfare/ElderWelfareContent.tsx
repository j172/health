"use client";

import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";

export default function ElderWelfareContent() {
  return (
    <FacilitySearchContent
      config={{
        facilityType: "elder_welfare",
        emoji: "👵",
        title: "老人福利機構查詢",
        description: "查詢衛福部全國老人福利機構名冊（安養、養護、長照等機構）。資料來源：衛福部社會及家庭署開放資料。",
        searchPlaceholder: "輸入機構名稱或縣市關鍵字",
        errorText: "查詢機構資料失敗，請稍後再試。",
        emptyStateNoKeyword: "附近查無收錄的老人福利機構，可改用關鍵字搜尋。",
        emptyStateWithKeyword: "查無符合的機構。",
        serviceItem: { label: "收容對象：" },
      }}
    />
  );
}
