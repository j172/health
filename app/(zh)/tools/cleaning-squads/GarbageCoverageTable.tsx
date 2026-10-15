"use client";

import {
  GARBAGE_COVERAGE,
  LIVE_STATUS_LABELS,
  type CoverageStatus,
  type LiveCoverageStatus,
} from "@/lib/tools/garbageTrucks/coverage";

const routeCounties = GARBAGE_COVERAGE.filter((row) => row.routes === "available").map((row) => row.county);
const liveCounties = GARBAGE_COVERAGE.filter((row) => row.live === "available").map((row) => row.county);
const unreachableLiveCounties = GARBAGE_COVERAGE.filter((row) => row.live === "unavailable").map((row) => row.county);

const statusCell = (status: CoverageStatus, availableLabel: string, noneLabel: string) =>
  status === "available" ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
      {availableLabel}
    </span>
  ) : (
    <span className="text-xs text-neutral-500 dark:text-slate-400">{noneLabel}</span>
  );

// 即時位置 has a third state: the city publishes a feed that our servers cannot reach
// (issue #679) — an amber 「暫無即時資料」, not the same grey blank as "no dataset known".
const liveCell = (status: LiveCoverageStatus) =>
  status === "unavailable" ? (
    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{LIVE_STATUS_LABELS.unavailable}</span>
  ) : (
    statusCell(status, LIVE_STATUS_LABELS.available, LIVE_STATUS_LABELS.none)
  );

/**
 * Per-county coverage table at the head of the 垃圾車與清潔隊 page (issue #674,
 * owner decision D6). Lists all 22 counties so nobody has to guess whether their
 * county is covered: route data exists for only some counties, and every county
 * — covered or not — can be sent to the 清潔隊 contact data via `onFindSquad`.
 * Driven entirely by lib/tools/garbageTrucks/coverage.ts, so later tickets that
 * add a city (or a live-location adapter) only change that data.
 */
export default function GarbageCoverageTable({ onFindSquad }: { onFindSquad: (county: string) => void }) {
  return (
    <section
      aria-labelledby="garbage-coverage-heading"
      className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20"
    >
      <h2 id="garbage-coverage-heading" className="text-base font-bold text-neutral-800 dark:text-slate-100">
        各縣市資料覆蓋範圍
      </h2>
      <p className="mt-1 text-sm text-neutral-700 dark:text-slate-300">
        垃圾車路線與收運時間目前只有{routeCounties.join("、")}提供資料；即時位置目前只有{liveCounties.join("、")}提供，{unreachableLiveCounties.join("、")}的資料集目前無法取得，標示為「{LIVE_STATUS_LABELS.unavailable}」。其他縣市尚無路線資料，請洽當地清潔隊；下表可直接查詢各縣市清潔隊的電話與地址。
      </p>

      <details open className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-700 dark:text-slate-200">
          逐縣市覆蓋明細（{GARBAGE_COVERAGE.length} 縣市）
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <caption className="sr-only">各縣市垃圾車路線、即時位置與清潔隊聯絡資料的覆蓋情形</caption>
            <thead>
              <tr className="border-b border-amber-200 text-xs text-neutral-600 dark:border-amber-900/50 dark:text-slate-400">
                <th scope="col" className="py-1.5 pr-3 font-semibold">
                  縣市
                </th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">
                  路線與收運時間
                </th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">
                  即時位置
                </th>
                <th scope="col" className="py-1.5 font-semibold">
                  清潔隊電話
                </th>
              </tr>
            </thead>
            <tbody>
              {GARBAGE_COVERAGE.map((row) => (
                <tr key={row.county} className="border-b border-amber-100 last:border-0 dark:border-amber-900/30">
                  <th scope="row" className="py-1.5 pr-3 font-medium text-neutral-800 dark:text-slate-100">
                    {row.county}
                  </th>
                  <td className="py-1.5 pr-3">{statusCell(row.routes, "有資料", "尚無路線資料")}</td>
                  <td className="py-1.5 pr-3">{liveCell(row.live)}</td>
                  <td className="py-1.5">
                    <button
                      type="button"
                      onClick={() => onFindSquad(row.county)}
                      className="text-xs font-semibold text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
                    >
                      查詢{row.county}清潔隊
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
