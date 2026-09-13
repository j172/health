"use client";

import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import ToolTypeTabs from "@/components/Tools/ToolTypeTabs";
import { facilitySearchConfigs } from "../facilityConfigs";
import GreenProductsContent from "./GreenProductsContent";

/**
 * issue #256: merged "green-shops", "green-hotels", "green-restaurants"
 * (each FacilitySearchContent + facilitySearchConfigs, unchanged) and
 * "green-products" (its own bespoke component, unchanged) into one
 * certification-type-tabbed page.
 */
export default function GreenCertificationsContent() {
  return (
    <ToolTypeTabs
      ariaLabel="環保標章類型"
      tabs={[
        {
          key: "green-shops",
          label: "綠色商店",
          icon: "🌱",
          content: (
            <FacilitySearchContent config={facilitySearchConfigs["green-shops"]} />
          ),
        },
        {
          key: "green-hotels",
          label: "環保旅館",
          icon: "🏨",
          content: (
            <FacilitySearchContent config={facilitySearchConfigs["green-hotels"]} />
          ),
        },
        {
          key: "green-restaurants",
          label: "環保餐廳",
          icon: "🍽️",
          content: (
            <FacilitySearchContent
              config={facilitySearchConfigs["green-restaurants"]}
            />
          ),
        },
        {
          key: "green-products",
          label: "環保產品",
          icon: "🛒",
          content: <GreenProductsContent />,
        },
      ]}
    />
  );
}
