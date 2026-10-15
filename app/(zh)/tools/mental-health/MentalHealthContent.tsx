"use client";

import { useSearchParams } from "next/navigation";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import ToolTypeTabs from "@/components/Tools/ToolTypeTabs";
import { facilitySearchConfigs } from "../facilityConfigs";

/**
 * issue #566: 心理健康地圖新增「成癮防治」分頁，與既有的心理諮商／心衛中心查詢並列。
 * 沿用 issue #256 合併工具頁用的 ToolTypeTabs，而不是另外寫一套切換邏輯。
 * issue #571：補上美沙冬跨區給藥院所和各縣市毒品危害防制中心兩個子分頁——正如
 * #566 預留的空間，只需要在 MENTAL_HEALTH_TAB_KEYS 和下面 tabs 陣列各加一筆，
 * 不需要更動這個元件或 FacilitySearchContent 的其他部分。
 */
export const MENTAL_HEALTH_TAB_KEYS = [
  "counseling",
  "addiction-treatment",
  "methadone-cross-district",
  "anti-drug-center",
] as const;

export type MentalHealthTabKey = (typeof MENTAL_HEALTH_TAB_KEYS)[number];

/**
 * 讓 `?tab=addiction-treatment` 可以直接深連結到成癮防治分頁（例如之後首頁狀態
 * 列、緊急電話頁或「家有長輩」情境頁導流過來）——不信任原始查詢字串，不是已知
 * tab key 就一律回退成 undefined（ToolTypeTabs 的預設值：第一個分頁）。
 */
export function resolveInitialTabKey(requestedTab: string | null): MentalHealthTabKey | undefined {
  return MENTAL_HEALTH_TAB_KEYS.includes(requestedTab as MentalHealthTabKey)
    ? (requestedTab as MentalHealthTabKey)
    : undefined;
}

export default function MentalHealthContent() {
  const searchParams = useSearchParams();
  const initialKey = resolveInitialTabKey(searchParams.get("tab"));

  return (
    <ToolTypeTabs
      ariaLabel="心理健康地圖資料類型"
      initialKey={initialKey}
      tabs={[
        {
          key: "counseling",
          label: "心理諮商／心衛中心",
          icon: "🧠",
          content: <FacilitySearchContent config={facilitySearchConfigs["mental-health"]} />,
        },
        {
          key: "addiction-treatment",
          label: "成癮防治",
          icon: "💊",
          content: <FacilitySearchContent config={facilitySearchConfigs["addiction-treatment"]} />,
        },
        {
          key: "methadone-cross-district",
          label: "跨區給藥",
          icon: "🧭",
          content: <FacilitySearchContent config={facilitySearchConfigs["methadone-cross-district"]} />,
        },
        {
          key: "anti-drug-center",
          label: "毒防中心",
          icon: "🏢",
          content: <FacilitySearchContent config={facilitySearchConfigs["anti-drug-center"]} />,
        },
      ]}
    />
  );
}
