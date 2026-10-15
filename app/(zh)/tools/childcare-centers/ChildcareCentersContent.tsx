"use client";

import { useState } from "react";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { facilitySearchConfigs } from "../facilityConfigs";

/**
 * issue #601（臺北／新北骨架）＋ #606（parent #599，六都剩餘四縣市：桃園／臺
 * 中／臺南／高雄）。`childcare_center`（托嬰中心本身）跟
 * `home_childcare_center`（協助家長找保母的居家托育服務中心媒合窗口）是兩個
 * 不同的 facilityType/config，用類型分頁切換——跟 long-term-care 合併 4 種類
 * 型的既有模式相同（見 app/(zh)/tools/long-term-care/LongTermCareContent.tsx），
 * 只是這裡沒有照顧圈地圖那段。home-childcare-centers 分頁目前仍只有臺北／新北
 * 兩縣市資料（#606 只加了「托嬰中心」本身的 4 個縣市，沒有居家托育服務中心媒
 * 合窗口），下方涵蓋範圍提示依分頁各自顯示正確的縣市清單。
 */
export const CHILDCARE_TYPE_KEYS = ["childcare-centers", "home-childcare-centers"] as const;
export type ChildcareTypeKey = (typeof CHILDCARE_TYPE_KEYS)[number];

const CHILDCARE_TYPE_META: Record<ChildcareTypeKey, { label: string; icon: string }> = {
  "childcare-centers": { label: "托嬰中心", icon: "🍼" },
  "home-childcare-centers": { label: "居家托育服務中心（找保母）", icon: "👩‍👧" },
};

const NCWISWEB_URL = "https://ncwisweb.sfaa.gov.tw/";

export default function ChildcareCentersContent() {
  const [activeType, setActiveType] = useState<ChildcareTypeKey>(CHILDCARE_TYPE_KEYS[0]);

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="托嬰與居家托育資源類型" className="flex flex-wrap gap-2">
        {CHILDCARE_TYPE_KEYS.map((key) => {
          const meta = CHILDCARE_TYPE_META[key];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeType === key}
              onClick={() => setActiveType(key)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                activeType === key
                  ? "bg-indigo-600 text-white shadow-xs dark:bg-indigo-500"
                  : "border border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-700"
              }`}
            >
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>

      {/* issue #601/#606 AC: 「托嬰中心」分頁現已涵蓋六都，「居家托育服務中心」
          分頁仍只有臺北／新北（#606 沒有加這個 facilityType 的其他縣市來源）。
          其餘縣市一律外連衛福部社家署全國系統性查詢。放在分頁下方、搜尋結果上
          方，確保每個分頁都看得到各自正確的涵蓋範圍。 */}
      <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <p>
          ℹ️{" "}
          {activeType === "childcare-centers"
            ? "目前僅收錄臺北市、新北市、桃園市、臺中市、臺南市、高雄市資料（高雄市資料筆數偏少且停留在2025年6月，可能不完整，詳見各筆資料下方標示）。"
            : "目前僅收錄臺北市、新北市資料。"}
          若您所在縣市尚未收錄，請改用衛福部社家署「
          <a
            href={appendOutboundUtm(NCWISWEB_URL, { medium: "national_fallback", campaign: "childcare_centers" })}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-amber-900 underline hover:text-indigo-600 dark:text-amber-100 dark:hover:text-indigo-400"
          >
            托育管理資訊系統全國系統性查詢
          </a>
          」。
        </p>
      </div>

      <FacilitySearchContent config={facilitySearchConfigs[activeType]} />
    </div>
  );
}
