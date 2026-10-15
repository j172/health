"use client";

import ToolTypeTabs from "@/components/Tools/ToolTypeTabs";
import FoodSafetyContent from "@/components/Tools/FoodSafetyContent";
import BorderFoodRejectionsContent from "@/components/Tools/BorderFoodRejectionsContent";

/**
 * /tools/food-safety is now two tabs (issue #671): the existing 農業部蔬果
 * 農藥殘留看板 (unchanged, reused as-is) and the new 邊境查驗不合格食品 list
 * built from the FDA's 不符合食品資訊 open data. Only the active tab mounts,
 * so the border-rejections request does not fire until that tab is opened.
 */
export default function FoodSafetyTabs() {
  return (
    <ToolTypeTabs
      ariaLabel="食安檢驗資料類型"
      tabs={[
        {
          key: "pesticide-residue",
          label: "蔬果農藥殘留",
          icon: "🥦",
          content: <FoodSafetyContent />,
        },
        {
          key: "border-rejections",
          label: "邊境查驗不合格食品",
          icon: "🛃",
          content: <BorderFoodRejectionsContent />,
        },
      ]}
    />
  );
}
