"use client";

import { useSearchParams } from "next/navigation";
import ToolTypeTabs from "@/components/Tools/ToolTypeTabs";
import CpcPricesClient from "@/components/Tools/CpcPricesClient";
import CpcStationsClient from "@/components/Tools/CpcStationsClient";
import type { CpcPriceItem, CpcPriceSummary } from "@/lib/server/cpc/prices";
import type { CpcStationItem } from "@/lib/server/cpc/stations";

/**
 * issue #483 (2.0 §D merge item M3): merged the standalone "/tools/cpc-stations"
 * (中油加油站服務據點地圖) page into "/tools/cpc-prices" (中油各式油氣牌價查詢) as a
 * second tab. Unlike the green-certifications family (#256/#448), both source
 * pages did their own server-side data fetching before render — not
 * client-side fetching inside each tab's content — so the merged page.tsx
 * awaits both `getCpcPrices()`/`getCpcPriceSummary()` and
 * `searchCpcStations({ limit: 650 })` up front and passes both datasets down
 * as props here, unchanged from how each original page fed its own client
 * component.
 */
export const CPC_PRICES_TAB_KEYS = ["prices", "stations"] as const;

export type CpcPricesTabKey = (typeof CPC_PRICES_TAB_KEYS)[number];

/**
 * issue #483: "/tools/cpc-stations" 301s here with `?tab=stations` so the
 * redirect lands directly on the station-map tab instead of the default
 * "本週油價" tab. A pure function (no React/Next hooks) so it is unit testable
 * on its own: never trust the raw query string — fall back to `undefined`
 * (ToolTypeTabs's default, the first tab) when it is missing or not one of
 * the known tab keys.
 */
export function resolveInitialTabKey(
  requestedTab: string | null,
): CpcPricesTabKey | undefined {
  return CPC_PRICES_TAB_KEYS.includes(requestedTab as CpcPricesTabKey)
    ? (requestedTab as CpcPricesTabKey)
    : undefined;
}

interface CpcPricesStationsContentProps {
  pricesItems: CpcPriceItem[];
  pricesCategories: string[];
  pricesSummary: CpcPriceSummary;
  pricesUpdatedAt: string;
  stations: CpcStationItem[];
  allStationServices: string[];
}

export default function CpcPricesStationsContent({
  pricesItems,
  pricesCategories,
  pricesSummary,
  pricesUpdatedAt,
  stations,
  allStationServices,
}: CpcPricesStationsContentProps) {
  const searchParams = useSearchParams();
  const initialKey = resolveInitialTabKey(searchParams.get("tab"));

  return (
    <ToolTypeTabs
      ariaLabel="中油查詢類型"
      initialKey={initialKey}
      tabs={[
        {
          key: "prices",
          label: "本週油價",
          icon: "⛽",
          content: (
            <CpcPricesClient
              initialItems={pricesItems}
              initialCategories={pricesCategories}
              initialSummary={pricesSummary}
              updatedAt={pricesUpdatedAt}
            />
          ),
        },
        {
          key: "stations",
          label: "附近加油站",
          icon: "🗺️",
          content: (
            <CpcStationsClient
              initialStations={stations}
              allServices={allStationServices}
            />
          ),
        },
      ]}
    />
  );
}
