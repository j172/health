"use client";

import { useState } from "react";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import ToolTypeTabs from "@/components/Tools/ToolTypeTabs";
import { facilitySearchConfigs } from "../facilityConfigs";
import GarbageCoverageTable from "./GarbageCoverageTable";
import GarbageLiveTab from "./GarbageLiveTab";
import GarbageRoutesTab from "./GarbageRoutesTab";

const ROUTES_TAB = "garbage-routes";
const LIVE_TAB = "garbage-live";
const SQUADS_TAB = "cleaning-squads";

/**
 * 垃圾車與清潔隊 (issue #674 / B-16, owner decision D6) — the former
 * cleaning-squads directory, upgraded in place under the same slug.
 *
 * Layout, top to bottom: page header, the per-county coverage table (always
 * visible so nobody assumes their county is covered), then a tab switcher:
 *   - 路線與收運時間: scheduled stops for the cities that publish route data
 *   - 垃圾車即時位置: live positions on a map (#679), fetched only while this tab is open
 *   - 清潔隊聯絡資訊: the original MOENV directory, covering every county
 * A county without route data is sent to the second tab, with a note telling
 * the visitor which 地區快篩 county to pick there (FacilitySearchContent keeps
 * its filter state to itself, so the hint is text rather than a preset).
 *
 * Extending it (the way #679 added the live tab): add an entry to the `tabs`
 * array below and a column value in lib/tools/garbageTrucks/coverage.ts; the
 * header, the coverage table and the existing tabs stay as they are.
 */
export default function CleaningSquadsContent() {
  const [activeTab, setActiveTab] = useState(ROUTES_TAB);
  const [squadHintCounty, setSquadHintCounty] = useState<string | null>(null);

  const findSquad = (county: string) => {
    setSquadHintCounty(county);
    setActiveTab(SQUADS_TAB);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">🚛 垃圾車與清潔隊</h1>
        <p className="text-neutral-600 dark:text-slate-300">
          查詢臺北市、新北市垃圾車的收運路線與時間，新北市另可查看垃圾車即時位置，並可查詢各縣市地方清潔隊的聯絡電話與地址。
        </p>
      </header>

      <GarbageCoverageTable onFindSquad={findSquad} />

      <ToolTypeTabs
        ariaLabel="垃圾車與清潔隊功能"
        activeKey={activeTab}
        onActiveKeyChange={(key) => {
          setSquadHintCounty(null);
          setActiveTab(key);
        }}
        tabs={[
          {
            key: ROUTES_TAB,
            label: "路線與收運時間",
            icon: "🚛",
            content: <GarbageRoutesTab onFindSquad={findSquad} />,
          },
          {
            key: LIVE_TAB,
            label: "垃圾車即時位置",
            icon: "📍",
            content: <GarbageLiveTab onFindSquad={findSquad} />,
          },
          {
            key: SQUADS_TAB,
            label: "清潔隊聯絡資訊",
            icon: "🧹",
            content: (
              <div className="space-y-4">
                {squadHintCounty && (
                  <p
                    role="status"
                    className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200"
                  >
                    請在下方「地區快篩」選擇「{squadHintCounty}」，即可查詢該縣市清潔隊的電話與地址。
                  </p>
                )}
                <FacilitySearchContent config={facilitySearchConfigs["cleaning-squads"]} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
