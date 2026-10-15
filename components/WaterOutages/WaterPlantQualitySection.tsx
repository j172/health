"use client";

import React, { useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { TAIWAN_WATER_UNSERVED_COUNTIES } from "@/lib/server/waterQuality/hardnessLookup";
import {
  PLANT_QUALITY_DISCLAIMER,
  filterPlants,
  formatSourceDate,
  isFailedPlant,
  listServiceAreas,
  plantKey,
  summarizePlantQuality,
  type WaterPlantQualityItem,
  type WaterPlantSummary,
} from "@/lib/server/waterQuality/plantQualityLookup";
import type { WaterQualityLoadState } from "./WaterHardnessSection";

interface WaterPlantQualitySectionProps {
  plants: WaterPlantSummary[];
  /** The file's own 「更新日期」 (YYYY-MM-DD). null = the file carried none. */
  sourceUpdatedOn: string | null;
  loadState: WaterQualityLoadState;
}

type DetailState = { status: "loading" } | { status: "error" } | { status: "ready"; items: WaterPlantQualityItem[] };

const CALLOUT_BASE = "rounded-xl border p-4 text-sm leading-relaxed";
const CALLOUT_NEUTRAL = `${CALLOUT_BASE} border-slate-200 bg-slate-50/70 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300`;
const CALLOUT_NOTICE = `${CALLOUT_BASE} border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100`;
const CALLOUT_FAILED = `${CALLOUT_BASE} border-red-300 bg-red-50 text-red-950 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-100`;

function PassBadge({ plant }: { plant: WaterPlantSummary }) {
  if (isFailedPlant(plant)) {
    return (
      <span className="rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white dark:bg-red-500">
        水質合格否：N（不合格）
      </span>
    );
  }
  if (plant.qualityPass === "Y") {
    return (
      <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        水質合格否：Y
      </span>
    );
  }
  return (
    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      檔案未標示合格否
    </span>
  );
}

export default function WaterPlantQualitySection({ plants, sourceUpdatedOn, loadState }: WaterPlantQualitySectionProps) {
  const [serviceArea, setServiceArea] = useState("");
  const [query, setQuery] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DetailState>>({});

  const stats = useMemo(() => summarizePlantQuality(plants), [plants]);
  const serviceAreas = useMemo(() => listServiceAreas(plants), [plants]);
  const visiblePlants = useMemo(
    () => filterPlants(plants, { serviceArea, query, failedOnly }),
    [plants, serviceArea, query, failedOnly],
  );
  const failedPlants = useMemo(() => plants.filter(isFailedPlant), [plants]);
  const fileDate = formatSourceDate(sourceUpdatedOn);
  const unservedNames = TAIWAN_WATER_UNSERVED_COUNTIES.map((c) => c.county).join("、");

  const loadDetail = async (key: string) => {
    setDetails((prev) => ({ ...prev, [key]: { status: "loading" } }));
    try {
      const res = await fetchWithTimeout(`/api/tools/water-quality?plant=${encodeURIComponent(key)}`, { timeoutMs: 8000 });
      const json = (await res.json()) as { ok?: boolean; items?: WaterPlantQualityItem[] };
      if (!res.ok || !json.ok || !Array.isArray(json.items)) throw new Error("plant detail request failed");
      const items = json.items;
      setDetails((prev) => ({ ...prev, [key]: { status: "ready", items } }));
    } catch (error) {
      console.warn("Failed to load water plant detail:", error);
      setDetails((prev) => ({ ...prev, [key]: { status: "error" } }));
    }
  };

  const togglePlant = (key: string) => {
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    if (details[key]?.status !== "ready") void loadDetail(key);
  };

  return (
    <section aria-labelledby="water-plant-quality-heading" className="space-y-4">
      <div>
        <h3 id="water-plant-quality-heading" className="text-base font-bold text-slate-900 dark:text-slate-100">
          🏭 各淨水場檢驗結果
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          台灣自來水公司公布各淨水場（給水系統）出水的水質檢驗結果與「水質合格否」。點選淨水場可展開全部檢驗項目，並與飲用水水質標準並列對照。
        </p>
      </div>

      {/* Scope limit — always visible, not only when a plant happens to be missing. */}
      <div className={CALLOUT_NOTICE} role="note">
        <strong className="font-bold">資料範圍：</strong>
        本資料以台灣自來水公司（台水）供水轄區範圍為主，{unservedNames}不在台水供水轄區，由各自的自來水單位供水，查不到不代表水質不好。
        {PLANT_QUALITY_DISCLAIMER}。
      </div>

      {loadState === "loading" && plants.length === 0 ? <div className={CALLOUT_NEUTRAL}>正在載入淨水場檢驗資料…</div> : null}

      {loadState === "error" ? (
        <div className={`${CALLOUT_BASE} border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200`} role="status">
          暫時無法載入淨水場檢驗資料，請稍後重新整理頁面。
        </div>
      ) : null}

      {loadState === "ready" && plants.length === 0 ? (
        <div className={CALLOUT_NEUTRAL} role="status">
          淨水場檢驗資料尚未同步到本站，請稍後再試。
        </div>
      ) : null}

      {loadState === "ready" && plants.length > 0 ? (
        <>
          {failedPlants.length > 0 ? (
            <div className={CALLOUT_FAILED} role="alert">
              <p className="text-base font-bold">
                ⚠️ 檔案中有 {failedPlants.length} 座淨水場的「水質合格否」標示為 N（不合格）
              </p>
              <p className="mt-1">
                {failedPlants.map((p) => p.plantName).join("、")}。這是台水公開檔案中的標示，檔案沒有說明是哪一項不合格，也沒有說明處理情形；
                {PLANT_QUALITY_DISCLAIMER}。請洽台灣自來水公司（客服專線 1910）。
              </p>
            </div>
          ) : (
            <div className={CALLOUT_NEUTRAL} role="status">
              檔案中 {stats.passed} 座淨水場的「水質合格否」標示為 Y（合格）
              {stats.unmarked > 0 ? `，另有 ${stats.unmarked} 座檔案未標示 Y 或 N` : ""}；沒有淨水場標示為 N。{PLANT_QUALITY_DISCLAIMER}。
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              縣市（依檔案標示）
              <select
                value={serviceArea}
                onChange={(event) => setServiceArea(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">全部（{stats.total} 座）</option>
                {serviceAreas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 sm:col-span-2">
              搜尋淨水場名稱或地址
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="例如：新山、板橋、Sinshan"
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={failedOnly}
              onChange={(event) => setFailedOnly(event.target.checked)}
              disabled={failedPlants.length === 0}
            />
            只看「水質合格否」標示 N 的淨水場{failedPlants.length === 0 ? "（目前沒有）" : ""}
          </label>

          <p className="text-xs text-slate-600 dark:text-slate-400" aria-live="polite">
            顯示 {visiblePlants.length} / {stats.total} 座淨水場
          </p>

          {visiblePlants.length === 0 ? (
            <div className={CALLOUT_NEUTRAL} role="status">
              沒有符合條件的淨水場。可以清除搜尋字詞或改選「全部」。
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
              {visiblePlants.map((plant) => {
                const key = plantKey(plant);
                const open = openKey === key;
                const failed = isFailedPlant(plant);
                const panelId = `water-plant-panel-${plant.officeCode}-${plant.plantCode}`;
                const detail = details[key];
                return (
                  <li key={key} className={failed ? "border-l-4 border-red-500 bg-red-50/60 dark:bg-red-950/20" : undefined}>
                    <button
                      type="button"
                      onClick={() => togglePlant(key)}
                      aria-expanded={open}
                      aria-controls={panelId}
                      className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                          {plant.plantName}
                          {plant.plantNameEn ? (
                            <span className="ml-1 text-[11px] font-normal text-slate-500">{plant.plantNameEn}</span>
                          ) : null}
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                          {plant.officeName} · {plant.address}
                          {plant.serviceArea ? ` · ${plant.serviceArea}` : ""}
                        </span>
                      </span>
                      <PassBadge plant={plant} />
                    </button>

                    {open ? (
                      <div id={panelId} className="border-t border-slate-100 px-3 py-3 dark:border-slate-800">
                        {detail?.status === "loading" || !detail ? (
                          <p className="text-xs text-slate-500">正在載入檢驗項目…</p>
                        ) : null}

                        {detail?.status === "error" ? (
                          <p className="text-xs text-red-700 dark:text-red-300" role="status">
                            暫時無法載入這座淨水場的檢驗項目。
                            <button
                              type="button"
                              onClick={() => void loadDetail(key)}
                              className="ml-2 font-semibold text-indigo-600 underline dark:text-indigo-400"
                            >
                              重試
                            </button>
                          </p>
                        ) : null}

                        {detail?.status === "ready" ? (
                          <div className="space-y-2">
                            {failed ? (
                              <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                                檔案將這座淨水場的「水質合格否」標示為 N，但沒有指出是哪一項；下表數值皆為檔案原文。
                              </p>
                            ) : null}
                            <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                              <table className="w-full text-left text-xs">
                                <thead className="sticky top-0 bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                                  <tr>
                                    <th className="px-3 py-2 font-semibold">檢驗項目</th>
                                    <th className="px-3 py-2 font-semibold">飲用水水質標準</th>
                                    <th className="px-3 py-2 font-semibold">單位</th>
                                    <th className="px-3 py-2 text-right font-semibold">檢驗值</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {detail.items.map((item, index) => (
                                    <tr key={`${index}-${item.name}`}>
                                      <td className="px-3 py-1.5 text-slate-800 dark:text-slate-200">{item.name}</td>
                                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{item.standard}</td>
                                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{item.unit}</td>
                                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                                        {item.value}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-[11px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
            <p>
              <strong className="font-semibold text-slate-700 dark:text-slate-300">檢驗值寫法：</strong>
              ND 表示未檢出（Not Detected）；「&lt;」加數字表示低於該數值；「－－」表示檔案沒有提供數值或沒有訂標準值。
              表中的檢驗值與標準都是檔案原文，本站沒有換算、也沒有自行判斷是否超標；「水質合格否」同樣是檔案原有欄位。
            </p>
            <p>
              <strong className="font-semibold text-slate-700 dark:text-slate-300">資料日期：</strong>
              {fileDate
                ? `${fileDate}（取自資料檔頁尾的「更新日期」）。`
                : "資料檔頁尾沒有載明更新日期。"}
              {PLANT_QUALITY_DISCLAIMER}；水質問題請洽供水單位。
            </p>
          </div>
        </>
      ) : null}
    </section>
  );
}
