"use client";

import ToolTypeTabs from "@/components/Tools/ToolTypeTabs";
import CarbonFootprintProductsContent from "./CarbonFootprintProductsContent";
import CarbonFootprintCoefficientsContent from "./CarbonFootprintCoefficientsContent";

/**
 * issue #256: merged "carbon-footprint-products" and
 * "carbon-footprint-coefficients" into one page with a
 * labels/coefficients tab. Both bespoke content components are reused
 * unmodified.
 */
export default function CarbonFootprintContent() {
  return (
    <ToolTypeTabs
      ariaLabel="碳足跡查詢類型"
      tabs={[
        {
          key: "carbon-footprint-products",
          label: "產品標籤查詢",
          icon: "🌍",
          content: <CarbonFootprintProductsContent />,
        },
        {
          key: "carbon-footprint-coefficients",
          label: "排放係數對照表",
          icon: "📐",
          content: <CarbonFootprintCoefficientsContent />,
        },
      ]}
    />
  );
}
