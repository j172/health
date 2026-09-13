"use client";

import { useEffect, useMemo, useState } from "react";

interface GenerationUnitItem {
  unit_name: string;
  unit_type: string;
  capacity_mw: number | null;
  net_generation_mw: number | null;
  capacity_ratio_pct: number | null;
  remark: string | null;
  source_datetime: string | null;
}

interface GenerationMixItem {
  source_category: string;
  capacity_mw: number | null;
  capacity_ratio_pct: number | null;
  data_org: string | null;
}

interface RadiationStationItem {
  station_no: string;
  station_name: string;
  dose_rate_usv_h: number | null;
  recorded_at: string | null;
  lat: number | null;
  lng: number | null;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const formatDateTime = (value: string | null): string => {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T"));
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-TW", { hour12: false });
};

const formatNumber = (value: number | null, digits = 1): string =>
  value === null || value === undefined ? "—" : value.toFixed(digits);

const MIX_COLORS: Record<string, string> = {
  台電: "bg-indigo-500",
  民營電廠: "bg-amber-500",
  汽電共生: "bg-emerald-500",
  合計: "bg-slate-400",
};

export default function PowerGridOverviewContent({
  initialUnits = [],
  initialMix = [],
  initialRadiationStations = [],
}: {
  initialUnits?: GenerationUnitItem[];
  initialMix?: GenerationMixItem[];
  initialRadiationStations?: RadiationStationItem[];
}) {
  const [units, setUnits] = useState<GenerationUnitItem[]>(initialUnits);
  const [mix, setMix] = useState<GenerationMixItem[]>(initialMix);
  const [radiationStations, setRadiationStations] = useState<RadiationStationItem[]>(
    initialRadiationStations,
  );
  const [selectedType, setSelectedType] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      setRefreshing(true);
      try {
        const res = await fetch("/api/power-grid-overview");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.units)) setUnits(data.units);
        if (Array.isArray(data.mix)) setMix(data.mix);
        if (Array.isArray(data.radiationStations)) setRadiationStations(data.radiationStations);
      } catch {
        // Keep showing the last-known-good snapshot on a transient failure.
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };

    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const unitTypes = useMemo(() => {
    const types = Array.from(new Set(units.map((u) => u.unit_type)));
    return types.sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [units]);

  const filteredUnits = useMemo(
    () => (selectedType === "all" ? units : units.filter((u) => u.unit_type === selectedType)),
    [units, selectedType],
  );

  const totals = useMemo(() => {
    const capacity = filteredUnits.reduce((sum, u) => sum + (u.capacity_mw ?? 0), 0);
    const generation = filteredUnits.reduce((sum, u) => sum + (u.net_generation_mw ?? 0), 0);
    return { capacity, generation };
  }, [filteredUnits]);

  const latestUnitTime = units.find((u) => u.source_datetime)?.source_datetime ?? null;
  const mixTotal = mix.find((m) => m.source_category === "合計");
  const mixBreakdown = mix.filter((m) => m.source_category !== "合計");

  return (
    <div className="space-y-8">
      {/* Intro */}
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          ⚡ 全台電力概況儀表板
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          整合台灣電力公司與經濟部能源署開放資料，一頁掌握全台各機組即時發電量、全國電源配比與核電廠周邊輻射偵測站即時劑量率。
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900">
            🔄 每 10 分鐘自動同步機組發電量與輻射監測資料{refreshing ? "（更新中…）" : ""}
          </span>
          {latestUnitTime ? (
            <span className="text-neutral-500 dark:text-slate-400">
              來源資料時間：{formatDateTime(latestUnitTime)}
            </span>
          ) : null}
        </div>
      </div>

      {/* 全國發電來源配比 */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-neutral-800 dark:text-slate-100">
          🥧 全國發電來源配比
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
          資料來源：經濟部能源署開放資料（極小型靜態總表，每日同步）
        </p>

        {mixBreakdown.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500 dark:text-slate-400">目前尚無配比資料。</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
              {mixBreakdown.map((m) => (
                <div
                  key={m.source_category}
                  className={`${MIX_COLORS[m.source_category] ?? "bg-slate-400"} h-full`}
                  style={{ width: `${Math.max(m.capacity_ratio_pct ?? 0, 0)}%` }}
                  title={`${m.source_category} ${formatNumber(m.capacity_ratio_pct)}%`}
                />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {mixBreakdown.map((m) => (
                <div
                  key={m.source_category}
                  className="rounded-xl border border-neutral-200 p-3 dark:border-slate-800"
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${MIX_COLORS[m.source_category] ?? "bg-slate-400"}`} />
                    <span className="font-semibold text-neutral-800 dark:text-slate-100">
                      {m.source_category}
                    </span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
                    {formatNumber(m.capacity_ratio_pct)}%
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-slate-400">
                    裝置容量 {formatNumber(m.capacity_mw, 0)} MW
                  </p>
                </div>
              ))}
            </div>
            {mixTotal ? (
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                全國總裝置容量合計約 {formatNumber(mixTotal.capacity_mw, 0)} MW（資料來源：{mixTotal.data_org ?? "經濟部能源署"}）
              </p>
            ) : null}
          </div>
        )}
      </section>

      {/* 各機組即時發電量 */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-neutral-800 dark:text-slate-100">
          🏭 各機組即時發電量
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
          資料來源：台灣電力公司開放資料 d006001（每 10 分鐘更新，含外購電力）
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedType("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedType === "all"
                ? "bg-primary text-white shadow-sm"
                : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            全部機組類型
          </button>
          {unitTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedType === type
                  ? "bg-primary text-white shadow-sm"
                  : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-600 dark:text-slate-300">
          <span>
            機組數：<strong className="text-neutral-900 dark:text-white">{filteredUnits.length}</strong>
          </span>
          <span>
            裝置容量合計：<strong className="text-neutral-900 dark:text-white">{formatNumber(totals.capacity, 0)} MW</strong>
          </span>
          <span>
            淨發電量合計：<strong className="text-neutral-900 dark:text-white">{formatNumber(totals.generation, 0)} MW</strong>
          </span>
        </div>

        {filteredUnits.length === 0 ? (
          <p className="mt-4 py-8 text-center text-sm text-neutral-500 dark:text-slate-400">
            尚無機組發電資料，請稍後再試。
          </p>
        ) : (
          <div className="mt-4 max-h-[480px] overflow-x-auto overflow-y-auto rounded-xl border border-neutral-200 dark:border-slate-800">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 bg-neutral-50 text-xs font-semibold text-neutral-500 dark:bg-slate-800/90 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">機組名稱</th>
                  <th className="px-4 py-3">類型</th>
                  <th className="px-4 py-3">裝置容量 (MW)</th>
                  <th className="px-4 py-3">淨發電量 (MW)</th>
                  <th className="px-4 py-3">發電比 (%)</th>
                  <th className="px-4 py-3">備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                {filteredUnits.map((u) => (
                  <tr
                    key={u.unit_name}
                    className="bg-white hover:bg-neutral-50/70 dark:bg-slate-900 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-neutral-900 dark:text-slate-100">
                      {u.unit_name}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600 dark:text-slate-300">{u.unit_type}</td>
                    <td className="px-4 py-2.5 font-mono text-neutral-600 dark:text-slate-300">
                      {formatNumber(u.capacity_mw)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-neutral-600 dark:text-slate-300">
                      {formatNumber(u.net_generation_mw)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-neutral-600 dark:text-slate-300">
                      {formatNumber(u.capacity_ratio_pct)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500 dark:text-slate-400">
                      {u.remark || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 核電廠周邊輻射偵測站 */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-neutral-800 dark:text-slate-100">
          ☢️ 核電廠周邊輻射偵測站（安全監測）
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
          資料來源：台灣電力公司開放資料 d525001，每 10 分鐘同步各站最新劑量率讀值——此資料集為核一／核二／核三廠周邊環境輻射安全監測，並非分區停電資訊。
        </p>

        {radiationStations.length === 0 ? (
          <p className="mt-4 py-8 text-center text-sm text-neutral-500 dark:text-slate-400">
            尚無輻射偵測站資料，請稍後再試。
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-800">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold text-neutral-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">站名</th>
                  <th className="px-4 py-3">站號</th>
                  <th className="px-4 py-3">劑量率 (µSv/h)</th>
                  <th className="px-4 py-3">觀測時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                {radiationStations.map((s) => (
                  <tr
                    key={s.station_no}
                    className="bg-white hover:bg-neutral-50/70 dark:bg-slate-900 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-neutral-900 dark:text-slate-100">
                      {s.station_name}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500 dark:text-slate-400">{s.station_no}</td>
                    <td className="px-4 py-2.5 font-mono text-neutral-600 dark:text-slate-300">
                      {formatNumber(s.dose_rate_usv_h, 3)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDateTime(s.recorded_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
