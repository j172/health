"use client";

import SidebarWidgetShell from "./SidebarWidgetShell";
import { useSidebarWidgetData } from "./useSidebarWidgetData";
import type { AntiFraudSummaryResponse } from "@/app/api/home/anti-fraud-summary/route";

/**
 * Independent homepage/sidebar widget for "本月新增涉詐網域數" (issue #575).
 *
 * Deliberately NOT folded into `/api/home-status` / `HomeStatusBar.tsx` —
 * that aggregation API is scoped on purpose to weather/AQI/UV/earthquake/
 * alerts (2026-10-13 product decision, see HomeStatusBar.tsx's doc
 * comment), so this follows the same pattern as the other independent
 * widgets below it in NewsSidebar.tsx (CpcPriceSidebarWidget etc.): its own
 * component, its own small API route, composed alongside the others.
 *
 * Empty-data handling (issue #575 AC: "資料為空時優雅處理，不顯示 0 或錯
 * 誤"): `hasData` is only true once the sync has run AND found at least one
 * domain this month. Before the first sync ever completes (`hasEverSynced`
 * false), or if a sync has run but genuinely found zero new domains this
 * month, this renders the shell's empty-state copy instead of a bare "0".
 */
export default function AntiFraudSidebarWidget() {
  const { status, data, isRefreshing, refresh } = useSidebarWidgetData<AntiFraudSummaryResponse>({
    buildUrl: () => "/api/home/anti-fraud-summary",
    parse: (json) => {
      if (!json?.ok) throw new Error("Unexpected /api/home/anti-fraud-summary payload");
      return json as AntiFraudSummaryResponse;
    },
    deps: [],
  });

  const hasData = Boolean(data?.hasEverSynced && data.count > 0);
  const hasError = status === "error";
  const showSpinner = status === "loading";

  const emptyMessage =
    data && !data.hasEverSynced
      ? "資料準備中，首次同步尚未完成"
      : "本月尚無新增涉詐網域";

  return (
    <SidebarWidgetShell
      dotColorClass="bg-rose-600"
      title="🚨 本月新增涉詐網域"
      onRefresh={refresh}
      refreshing={isRefreshing}
      showSpinner={showSpinner}
      hasData={hasData}
      hasError={hasError}
      emptyMessage={emptyMessage}
      errorMessage="載入失敗，無法取得涉詐網域統計"
      footerHref="/tools/anti-fraud"
      footerLabel="查詢可疑網址 →"
    >
      {data && (
        <div className="flex items-baseline justify-between rounded-xl bg-rose-50 p-3.5 dark:bg-rose-950/30">
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              內政部警政署 165 反詐騙諮詢專線公布
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-rose-700 dark:text-rose-300">{data.count}</span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">個新增涉詐網域</span>
            </div>
          </div>
        </div>
      )}
    </SidebarWidgetShell>
  );
}
