"use client";

import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import ToolTypeTabs from "@/components/Tools/ToolTypeTabs";
import { facilitySearchConfigs } from "../facilityConfigs";

/**
 * issue #256: merged "child-welfare-nurseries" and "child-welfare-centers"
 * into one type-tabbed page. Each tab renders the exact same
 * FacilitySearchContent + facilitySearchConfigs entry the two original pages
 * used — nothing about the underlying search/config changed, only the
 * navigation into it.
 */
export default function ChildWelfareInstitutionsContent() {
  return (
    <ToolTypeTabs
      ariaLabel="兒少機構類型"
      tabs={[
        {
          key: "child-welfare-nurseries",
          label: "全國親子館",
          icon: "🧸",
          content: (
            <FacilitySearchContent
              config={facilitySearchConfigs["child-welfare-nurseries"]}
            />
          ),
        },
        {
          key: "child-welfare-centers",
          label: "兒少福利中心",
          icon: "👶",
          content: (
            <FacilitySearchContent
              config={facilitySearchConfigs["child-welfare-centers"]}
            />
          ),
        },
      ]}
    />
  );
}
