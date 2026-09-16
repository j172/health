"use client";

import Link from "next/link";
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
    <div className="space-y-6">
      {/* 導流至全台積淹水即時感測地圖 */}
      <div className="rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 dark:from-slate-800 dark:to-blue-950/40 p-4 border border-sky-100 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🌊</span>
          <div>
            <div className="text-xs font-bold text-sky-950 dark:text-sky-300">豪雨低窪路面積水示警？</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">查看水利署 IoT 路面公分級水深感測、涵洞積水警戒與避難收容學校</div>
          </div>
        </div>
        <Link
          href="/tools/inundation-map"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold whitespace-nowrap transition shadow-sm"
        >
          <span>查看積淹水感測地圖</span>
          <span>→</span>
        </Link>
      </div>

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
    </div>
  );
}
