"use client";

import { useLanguage } from "@/app/context/LanguageContext";
import type { ConflictsGlobeData } from "@/lib/tools/globeWatch/conflictsTransform";
import { CONFLICT_LEGEND } from "@/lib/tools/globeWatch/conflictsTransform";
import { resolveConflictRootName } from "@/lib/tools/globeWatch/conflictCameoRootNames";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import GlobeWatchItemTabs from "./GlobeWatchItemTabs";
import GlobeWatchConflictsClient from "./GlobeWatchConflictsClient";
import GlobeWatchConflictsLegend from "./GlobeWatchConflictsLegend";

const GDELT_PROJECT_URL = "https://www.gdeltproject.org/";

/**
 * Issue #774 (parent #773) — composes the "武裝衝突" (conflicts) item: the
 * tab switcher, the globe's conflict-event layer, the severity legend, the
 * required GDELT citation + "非本站判定" disclaimer notice, and a
 * server-rendered event list with its own explicit empty state. `data` is
 * computed once, server-side, in this item's page.tsx (same division of
 * labor as GlobeWatchTyphoonsItem.tsx).
 *
 * The attribution block below is NOT optional chrome — GDELT's own terms
 * condition public/commercial display on "citation to the GDELT Project and
 * a link to gdeltproject.org" (#773's spec, "Further Notes"), and the
 * disclaimer text follows this site's own standing "查核機構，非本站判定"
 * idiom (see components/News/FactCheckNotice.tsx) applied to the first
 * inherently political/sensitive Global Watch topic: this page relays named
 * open-data sources, it does not make this site's own political judgment
 * about any conflict, government, or party (#773's spec: "Explicitly not an
 * editorial judgment").
 */
export default function GlobeWatchConflictsItem({ data }: { data: ConflictsGlobeData }) {
  const { t, locale } = useLanguage();

  const gdeltLink = appendOutboundUtm(GDELT_PROJECT_URL, {
    medium: "tool_outbound",
    campaign: "global_watch_conflicts",
  });

  return (
    <div className="space-y-6">
      <GlobeWatchItemTabs />

      <GlobeWatchConflictsClient data={data} />

      <GlobeWatchConflictsLegend legend={CONFLICT_LEGEND} />

      {/* AC: GDELT 引用聲明（引用＋連回 gdeltproject.org）與「本站不代表政治判斷，
          資料轉載自列名來源」的免責文字 — same amber-toned notice style
          components/News/FactCheckNotice.tsx already uses for "查核機構，非本站
          判定". */}
      <div
        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200"
        data-testid="globe-watch-conflicts-attribution"
      >
        <p>
          {t(
            "globalWatchTool.conflicts.citation",
            "資料引用：The GDELT Project",
          )}{" "}
          <a
            href={gdeltLink}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline hover:text-amber-700 dark:hover:text-amber-100"
          >
            gdeltproject.org ↗
          </a>
        </p>
        <p className="mt-1">
          {t(
            "globalWatchTool.conflicts.disclaimer",
            "本頁地球標記轉載自 GDELT 收錄、來源媒體報導之衝突事件，不代表本站對任何衝突、政治立場或各方責任之判定；詳細內容與正確性請以原始新聞來源為準。",
          )}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
          {t("globalWatchTool.conflicts.listHeading", "目前相關的武裝衝突事件（GDELT）")}
        </h2>

        {data.emptyState ? (
          <p
            data-testid="globe-watch-conflicts-empty-state"
            className="py-6 text-center text-sm text-slate-500 dark:text-slate-400"
          >
            {t("globalWatchTool.conflicts.emptyState", "⚔️ 目前 GDELT 無符合篩選條件的衝突事件。")}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="globe-watch-conflicts-list">
            {data.listItems.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: item.markerColor }}
                    />
                    {resolveConflictRootName(item.rootCode, locale)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{item.eventDate}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {item.countryName || t("globalWatchTool.conflicts.unknownCountry", "未知地點")}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.description}</p>
                {item.fatalitiesEstimate != null && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("globalWatchTool.conflicts.fatalities", "估計傷亡：")} {item.fatalitiesEstimate}
                  </p>
                )}
                {item.sourceUrl && (
                  <a
                    href={appendOutboundUtm(item.sourceUrl, {
                      medium: "tool_outbound",
                      campaign: "global_watch_conflicts",
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs font-bold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                  >
                    {t("globalWatchTool.conflicts.readOriginal", "閱讀原文 ↗")}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
