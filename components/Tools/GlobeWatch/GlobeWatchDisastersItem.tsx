"use client";

import { useMemo, useRef, useState } from "react";
import { useLanguage } from "@/app/context/LanguageContext";
import {
  buildDisastersGlobeData,
  type DisasterEventRow,
  type DisasterListItem,
} from "@/lib/tools/globeWatch/disastersTransform";
import { GDACS_DISASTER_TYPES, DISASTER_TYPE_NAMES, resolveDisasterTypeName, type GdacsDisasterType } from "@/lib/tools/globeWatch/disasterTypeNames";
import { GDACS_ALERT_LEVELS, GDACS_ALERT_LEVEL_NAMES, resolveAlertLevelName } from "@/lib/tools/globeWatch/disasterAlertLevelNames";
import { resolveCountryName } from "@/lib/tools/globeWatch/disasterCountryNames";
import GlobeWatchClient from "./GlobeWatchClient";
import GlobeWatchItemTabs from "./GlobeWatchItemTabs";

/**
 * Issue #594 (parent #583) — composes the "全球災害" (disasters) item: the
 * tab switcher, the globe's disaster data layer, a per-type checkbox filter
 * (AC: "可以在項目內勾選要顯示的災種"), the alert-level color legend, and a
 * server-fetched event list grouped by disaster type with its own
 * explicit empty state (AC: "某災種目前沒有事件時顯示明確空狀態說明").
 *
 * `rows` is the full current FL/VO/DR/WF dataset (already filtered to those
 * 4 types and to "currently active" by getCurrentGdacsDisasterEvents — see
 * the page.tsx files) — the checkbox filter and the globe/list split both
 * happen client-side via the pure buildDisastersGlobeData transform, same
 * division of labor as the earthquake item's M4/M6/M7 filter.
 */
export default function GlobeWatchDisastersItem({ rows }: { rows: DisasterEventRow[] }) {
  const { t, locale } = useLanguage();
  const [enabledTypes, setEnabledTypes] = useState<Set<GdacsDisasterType>>(
    () => new Set(GDACS_DISASTER_TYPES),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lng: number; lat: number; flyToToken: number } | null>(null);
  const flyTokenRef = useRef(0);

  const globeData = useMemo(() => buildDisastersGlobeData(rows, enabledTypes), [rows, enabledTypes]);

  const toggleType = (type: GdacsDisasterType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleSelectListItem = (item: DisasterListItem) => {
    setSelectedId(item.id);
    flyTokenRef.current += 1;
    setFlyTo({ lng: item.lng, lat: item.lat, flyToToken: flyTokenRef.current });
  };

  const popupLabels = {
    readOriginalLabel: t("globalWatchTool.disasters.readOriginal", "閱讀原文 ↗"),
    unknownCountryLabel: t("globalWatchTool.disasters.unknownCountry", "未知地點"),
  };

  const itemsByType = useMemo(() => {
    const map = new Map<GdacsDisasterType, DisasterListItem[]>();
    for (const type of GDACS_DISASTER_TYPES) map.set(type, []);
    for (const item of globeData.listItems) {
      map.get(item.eventType)?.push(item);
    }
    return map;
  }, [globeData.listItems]);

  return (
    <div className="space-y-6">
      <GlobeWatchItemTabs />

      <GlobeWatchClient
        disasters={{
          featureCollection: globeData.featureCollection,
          flyTo,
          onFeatureClick: (properties) => setSelectedId(properties.id),
          popupLabels,
        }}
      />

      {/* Alert-level color legend (AC: 每個項目都有專屬圖例；依 GDACS 紅/橙/綠警
          戒等級上色). Reads the same color each marker uses so the legend
          and the globe can't drift apart. */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
        data-testid="globe-watch-disasters-legend"
      >
        <span className="font-semibold text-slate-700 dark:text-slate-300">
          {t("globalWatchTool.disasters.legendHeading", "警戒等級圖例：")}
        </span>
        {GDACS_ALERT_LEVELS.map((level) => (
          <span key={level} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: GDACS_ALERT_LEVEL_NAMES[level].color }}
            />
            {resolveAlertLevelName(level, locale)}
          </span>
        ))}
      </div>

      {/* Disaster-type checkbox filter (AC: 項目內可勾選要顯示的災種). */}
      <fieldset
        className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        data-testid="globe-watch-disasters-type-filter"
      >
        <legend className="px-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
          {t("globalWatchTool.disasters.typeFilterHeading", "顯示災種：")}
        </legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {GDACS_DISASTER_TYPES.map((type) => (
            <label key={type} className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={enabledTypes.has(type)}
                onChange={() => toggleType(type)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
              />
              <span aria-hidden="true">{DISASTER_TYPE_NAMES[type].emoji}</span>
              {resolveDisasterTypeName(type, locale)}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Per-type event list, each with its own explicit empty state (AC:
          某災種目前沒有事件時顯示明確空狀態說明) when checked but empty. An
          unchecked type's section is omitted entirely rather than shown
          disabled, mirroring how the globe itself drops its features. */}
      <div className="space-y-5" data-testid="globe-watch-disasters-list">
        {GDACS_DISASTER_TYPES.filter((type) => enabledTypes.has(type)).map((type) => {
          const items = itemsByType.get(type) ?? [];
          const isEmpty = globeData.emptyByType[type];
          return (
            <section key={type} data-testid={`globe-watch-disasters-section-${type}`}>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-200">
                <span aria-hidden="true">{DISASTER_TYPE_NAMES[type].emoji}</span>
                {resolveDisasterTypeName(type, locale)}
              </h3>
              {isEmpty ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                  {t("globalWatchTool.disasters.emptyStateTemplate", "目前無{type}事件").replace(
                    "{type}",
                    resolveDisasterTypeName(type, locale),
                  )}
                </p>
              ) : (
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectListItem(item)}
                        aria-pressed={selectedId === item.id}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                          selectedId === item.id
                            ? "border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/40"
                            : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: item.markerColor }}
                          />
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {resolveAlertLevelName(item.alertLevel, locale)}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {item.countryIso
                              ? resolveCountryName(item.countryIso, locale)
                              : t("globalWatchTool.disasters.unknownCountry", "未知地點")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.title}</p>
                        {item.reportUrl && (
                          <a
                            href={item.reportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                          >
                            {t("globalWatchTool.disasters.readOriginal", "閱讀原文 ↗")}
                          </a>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
