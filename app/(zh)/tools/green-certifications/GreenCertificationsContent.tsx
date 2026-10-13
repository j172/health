"use client";

import { useSearchParams } from "next/navigation";
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
export const GREEN_CERTIFICATION_TAB_KEYS = [
  "green-shops",
  "green-hotels",
  "green-restaurants",
  "green-products",
] as const;

export type GreenCertificationTabKey =
  (typeof GREEN_CERTIFICATION_TAB_KEYS)[number];

/**
 * issue #448 (2.0 §D merge item M2): "/tools/green-shops" 301s here with
 * `?tab=green-shops` so the redirect lands directly on the right tab instead
 * of the default. A pure function (no React/Next hooks) so it is unit
 * testable on its own: never trust the raw query string — fall back to
 * `undefined` (ToolTypeTabs's default, the first tab) when it is missing or
 * not one of the known tab keys.
 */
export function resolveInitialTabKey(
  requestedTab: string | null,
): GreenCertificationTabKey | undefined {
  return GREEN_CERTIFICATION_TAB_KEYS.includes(
    requestedTab as GreenCertificationTabKey,
  )
    ? (requestedTab as GreenCertificationTabKey)
    : undefined;
}

export default function GreenCertificationsContent() {
  const searchParams = useSearchParams();
  const initialKey = resolveInitialTabKey(searchParams.get("tab"));

  return (
    <ToolTypeTabs
      ariaLabel="環保標章類型"
      initialKey={initialKey}
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
