"use client";

import React, { useMemo, useState } from "react";
import { TAIWAN_COUNTIES } from "@/lib/constants/taiwanDistricts";
import {
  NOT_IN_TAIWAN_WATER_HEADLINE,
  TAIWAN_WATER_UNSERVED_COUNTIES,
  canonicalCountyName,
  classifyHardness,
  resolveHardnessLookup,
  type HardnessClassKey,
  type WaterHardnessRow,
} from "@/lib/server/waterQuality/hardnessLookup";

export type WaterQualityLoadState = "loading" | "ready" | "error";

interface WaterHardnessSectionProps {
  rows: WaterHardnessRow[];
  /** When this site last synced the file (ISO). The file itself carries no date. */
  syncedAt: string | null;
  loadState: WaterQualityLoadState;
  /** Optional county to start on (e.g. the visitor's manually chosen county). */
  initialCounty?: string;
}

const CLASS_STYLES: Record<HardnessClassKey, { badge: string; bar: string }> = {
  soft: {
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    bar: "bg-sky-500",
  },
  moderate: {
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  hard: {
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  "very-hard": {
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    bar: "bg-rose-500",
  },
};

// `sample` is any value inside the band; the key and label come from classifyHardness so the
// legend can never drift from the bands the rows are actually coloured by.
const BAND_LEGEND: { sample: number; range: string }[] = [
  { sample: 30, range: "60 以下" },
  { sample: 90, range: "61–120" },
  { sample: 150, range: "121–180" },
  { sample: 250, range: "180 以上" },
];

// Widest value in the real file is 294; the bar is only a visual cue next to the number.
const BAR_FULL_SCALE_MG_PER_L = 300;

const formatValue = (value: number): string => value.toLocaleString("zh-TW", { maximumFractionDigits: 1 });

const formatSyncedAt = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric" });
};

const CALLOUT_BASE = "rounded-xl border p-4 text-sm leading-relaxed";
const CALLOUT_NEUTRAL = `${CALLOUT_BASE} border-slate-200 bg-slate-50/70 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300`;
const CALLOUT_NOTICE = `${CALLOUT_BASE} border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100`;

function HardnessBadge({ value }: { value: number }) {
  const hardnessClass = classifyHardness(value);
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${CLASS_STYLES[hardnessClass.key].badge}`}>
      {hardnessClass.label}
    </span>
  );
}

export default function WaterHardnessSection({ rows, syncedAt, loadState, initialCounty }: WaterHardnessSectionProps) {
  const [county, setCounty] = useState<string>(() => {
    const start = canonicalCountyName(initialCounty);
    return (TAIWAN_COUNTIES as readonly string[]).includes(start) ? start : "";
  });
  const [district, setDistrict] = useState<string>("");

  const lookup = useMemo(() => resolveHardnessLookup(rows, county, district), [rows, county, district]);

  const districtOptions = useMemo(
    () => (county ? rows.filter((r) => r.county === county).map((r) => r.district) : []),
    [rows, county],
  );

  const unservedCounties = new Set(TAIWAN_WATER_UNSERVED_COUNTIES.map((c) => c.county));
  const syncedOn = formatSyncedAt(syncedAt);

  const selectCounty = (next: string) => {
    setCounty(canonicalCountyName(next));
    setDistrict("");
  };

  return (
    <section aria-labelledby="water-hardness-heading" className="space-y-4">
      <div>
        <h3 id="water-hardness-heading" className="text-base font-bold text-slate-900 dark:text-slate-100">
          💧 各鄉鎮自來水總硬度
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          總硬度主要反映水中鈣、鎂離子的多寡，會影響口感、煮水結垢與清潔用品的起泡程度；硬度高低與自來水是否符合飲用水水質標準是兩回事。
        </p>
      </div>

      {/* Scope limit — always visible, not only when a county happens to be missing. */}
      <div className={CALLOUT_NOTICE} role="note">
        <strong className="font-bold">資料範圍：</strong>
        本資料來自台灣自來水公司（台水），只涵蓋台水供水轄區，共 {TAIWAN_COUNTIES.length - TAIWAN_WATER_UNSERVED_COUNTIES.length}{" "}
        個縣市。{TAIWAN_WATER_UNSERVED_COUNTIES.map((c) => c.county).join("、")}不在台水轄區，另由各自的自來水單位供水，查不到不代表水質不好。
      </div>

      {loadState === "error" ? (
        <div className={`${CALLOUT_BASE} border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200`} role="alert">
          暫時無法載入水質硬度資料，請稍後重新整理頁面。（臺北市、金門縣、連江縣的供水說明不受影響。）
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          縣市
          <select
            value={county}
            onChange={(event) => selectCounty(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">全部縣市（總覽）</option>
            {TAIWAN_COUNTIES.map((name) => (
              <option key={name} value={name}>
                {unservedCounties.has(name) ? `${name}（${NOT_IN_TAIWAN_WATER_HEADLINE}）` : name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          鄉鎮市區
          <select
            value={district}
            onChange={(event) => setDistrict(event.target.value)}
            disabled={districtOptions.length === 0}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">{districtOptions.length === 0 ? "請先選擇縣市" : "全部鄉鎮市區"}</option>
            {districtOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div aria-live="polite" className="space-y-3">
        {loadState === "loading" && rows.length === 0 && lookup.kind !== "not-in-taiwan-water-area" ? (
          <div className={CALLOUT_NEUTRAL}>正在載入水質硬度資料…</div>
        ) : null}

        {loadState === "ready" && lookup.kind === "overview" && lookup.total === 0 ? (
          <div className={CALLOUT_NEUTRAL}>水質硬度資料尚未同步到本站，請稍後再試。</div>
        ) : null}

        {lookup.kind === "overview" && lookup.total > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">縣市</th>
                  <th className="px-3 py-2 font-semibold">鄉鎮市區數</th>
                  <th className="px-3 py-2 font-semibold">總硬度範圍（毫克/公升）</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
                {lookup.counties.map((summary) => (
                  <tr key={summary.county}>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => selectCounty(summary.county)}
                        className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {summary.county}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{summary.count}</td>
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                      {summary.min === summary.max
                        ? formatValue(summary.min)
                        : `${formatValue(summary.min)} – ${formatValue(summary.max)}`}
                    </td>
                  </tr>
                ))}
                {lookup.unserved.map((unserved) => (
                  <tr key={unserved.county} className="bg-amber-50/60 dark:bg-amber-950/20">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => selectCounty(unserved.county)}
                        className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {unserved.county}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-slate-500" colSpan={2}>
                      {NOT_IN_TAIWAN_WATER_HEADLINE}（由{unserved.supplier}供水，本資料沒有涵蓋）
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {lookup.kind === "not-in-taiwan-water-area" ? (
          <div className={CALLOUT_NOTICE} role="status">
            <p className="text-base font-bold">
              {lookup.county}
              {lookup.district ? ` ${lookup.district}` : ""}：{lookup.headline}
            </p>
            <p className="mt-1">{lookup.message}</p>
          </div>
        ) : null}

        {lookup.kind === "no-data" && loadState === "ready" ? (
          <div className={CALLOUT_NEUTRAL} role="status">
            <p className="font-bold">{lookup.headline}</p>
            <p className="mt-1">{lookup.message}</p>
          </div>
        ) : null}

        {lookup.kind === "unknown-county" ||
        lookup.kind === "county-not-listed" ||
        lookup.kind === "district-not-listed" ? (
          <div className={CALLOUT_NEUTRAL} role="status">
            <p className="font-bold">{lookup.headline}</p>
            <p className="mt-1">{lookup.message}</p>
          </div>
        ) : null}

        {lookup.kind === "county" ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {lookup.county}共 {lookup.rows.length} 個鄉鎮市區有資料，總硬度 {formatValue(lookup.min)}–{formatValue(lookup.max)}{" "}
              毫克/公升。點選鄉鎮市區可查看單一數值。
            </p>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
              {lookup.rows.map((row) => {
                const style = CLASS_STYLES[classifyHardness(row.hardnessMgPerL).key];
                return (
                  <li key={row.district}>
                    <button
                      type="button"
                      onClick={() => setDistrict(row.district)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <span className="w-24 shrink-0 font-semibold text-slate-800 dark:text-slate-100">{row.district}</span>
                      <span className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                        <span
                          className={`block h-2 rounded-full ${style.bar}`}
                          style={{ width: `${Math.min(100, (row.hardnessMgPerL / BAR_FULL_SCALE_MG_PER_L) * 100)}%` }}
                        />
                      </span>
                      <span className="w-12 shrink-0 text-right tabular-nums text-slate-700 dark:text-slate-200">
                        {formatValue(row.hardnessMgPerL)}
                      </span>
                      <HardnessBadge value={row.hardnessMgPerL} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {lookup.kind === "district" ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900" role="status">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {lookup.county} {lookup.row.district}
              </h4>
              <HardnessBadge value={lookup.row.hardnessMgPerL} />
            </div>
            <p className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                {formatValue(lookup.row.hardnessMgPerL)}
              </span>
              <span className="text-xs text-slate-500">{lookup.row.unit}（總硬度）</span>
            </p>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{lookup.hardnessClass.description}</p>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              {lookup.county}各鄉鎮的總硬度介於 {formatValue(lookup.countyMin)}–{formatValue(lookup.countyMax)} {lookup.row.unit}。
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-[11px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-slate-700 dark:text-slate-300">硬度分級（毫克/公升）：</span>
          {BAND_LEGEND.map(({ sample, range }) => {
            const band = classifyHardness(sample);
            return (
              <span key={band.key} className={`rounded-md px-2 py-0.5 font-bold ${CLASS_STYLES[band.key].badge}`}>
                {band.label} {range}
              </span>
            );
          })}
        </div>
        <p>
          分級採常見的美國地質調查所（USGS）總硬度分級，只用來幫助理解數字大小，非本站判定，也不是飲用水水質標準；數值為台水依鄉鎮公布的代表值，實際水質因管線、取水來源與季節而異。
        </p>
        <p>
          <strong className="font-semibold">資料日期：</strong>
          資料集檔案本身不含更新日期（目錄標示約每 3 個月更新一次）。
          {loadState !== "ready"
            ? null
            : syncedOn
              ? `本站最近一次成功同步：${syncedOn}。`
              : "本站尚未同步到這份資料。"}
        </p>
      </div>
    </section>
  );
}
