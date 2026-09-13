"use client";

import ToolTypeTabs from "@/components/Tools/ToolTypeTabs";
import WaterLevelStationsContent from "./WaterLevelStationsContent";
import ReservoirStatusContent from "./ReservoirStatusContent";

/**
 * issue #256: merged "water-level-stations" and "reservoir-status" into one
 * page with a river/reservoir tab. Both bespoke content components are
 * reused unmodified.
 */
export default function WaterConditionsContent() {
  return (
    <ToolTypeTabs
      ariaLabel="水情資料類型"
      tabs={[
        {
          key: "water-level-stations",
          label: "河川水位",
          icon: "💧",
          content: <WaterLevelStationsContent />,
        },
        {
          key: "reservoir-status",
          label: "水庫營運",
          icon: "🏞️",
          content: <ReservoirStatusContent />,
        },
      ]}
    />
  );
}
