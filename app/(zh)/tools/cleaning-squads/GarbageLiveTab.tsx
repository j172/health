"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import LoadingOrb from "@/components/ui/LoadingOrb";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { GARBAGE_COVERAGE } from "@/lib/tools/garbageTrucks/coverage";
import {
  LIVE_EXPIRED_AGE_SECONDS,
  LIVE_FRESH_MAX_AGE_SECONDS,
  formatTaipeiDateTime,
  formatTruckAge,
  type LiveTrucksCityResult,
  type LiveTrucksResponse,
} from "@/lib/tools/garbageTrucks/live";

const GarbageLiveMap = dynamic(() => import("./GarbageLiveMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-2xl border border-neutral-200 dark:border-slate-800">
      <LoadingOrb size={28} />
    </div>
  ),
});

/** While the tab stays open and visible the page asks again this often (the server caches ~90 s, so this is cheap). */
const AUTO_REFRESH_MS = 60_000;

const FRESH_MINUTES = LIVE_FRESH_MAX_AGE_SECONDS / 60;
const EXPIRED_MINUTES = LIVE_EXPIRED_AGE_SECONDS / 60;

const liveCounties = GARBAGE_COVERAGE.filter((row) => row.live === "available").map((row) => row.county);
const unreachableCounties = GARBAGE_COVERAGE.filter((row) => row.live === "unavailable").map((row) => row.county);

type LiveApiResponse = LiveTrucksResponse & { ok: boolean };

/**
 * 垃圾車即時位置 tab of the 垃圾車與清潔隊 page (issue #679 / B-17).
 *
 * Positions come from /api/garbage-trucks/live, which reads the city's open-data
 * feed only while a visitor has the page open and never stores it. The tab shows
 * the data's own timestamp, flags reports older than 10 minutes, says how many
 * very old ones were left out, and degrades per county: a county whose feed is
 * down gets a plain notice and a way to the 清潔隊 contact tab. It never asks
 * for the visitor's location (the map simply opens on the trucks).
 */
export default function GarbageLiveTab({ onFindSquad }: { onFindSquad: (county: string) => void }) {
  const [data, setData] = useState<LiveApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetchWithTimeout("/api/garbage-trucks/live", { timeoutMs: 12000, cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: LiveApiResponse = await res.json();
        if (!json.ok || !Array.isArray(json.cities)) throw new Error("bad response");
        if (!cancelled) {
          setData(json);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, AUTO_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshTick]);

  const refresh = () => {
    setLoading(true);
    setRefreshTick((tick) => tick + 1);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-neutral-800 dark:text-slate-100">📍 垃圾車即時位置</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-slate-300">
          顯示{liveCounties.join("、")}垃圾車目前回報的位置。資料在你開啟本頁時才向市府取得，本站不儲存車輛位置，也不會取得你的位置。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 shadow-xs hover:bg-neutral-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          🔄 重新整理
        </button>
        <span className="text-xs text-neutral-500 dark:text-slate-400">本頁開啟時每分鐘自動更新一次</span>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        >
          {data ? "更新失敗，以下仍是上一次取得的資料，請稍後再按「重新整理」。" : "即時位置暫時無法載入，請稍後按「重新整理」再試。"}
        </p>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-10">
          <LoadingOrb size={28} />
        </div>
      ) : data ? (
        data.cities.map((city) => <CityLive key={city.city} result={city} generatedAt={data.generatedAt} onFindSquad={onFindSquad} />)
      ) : null}

      <p className="text-xs text-neutral-500 dark:text-slate-400">
        其他縣市：{unreachableCounties.join("、")}的即時位置資料集目前無法取得（標示為「暫無即時資料」），其餘縣市尚未提供，詳見上方「各縣市資料覆蓋範圍」。
      </p>

      <SourceNote sources={data ? data.cities.map((city) => city.source) : []} />
    </div>
  );
}

function CityLive({
  result,
  generatedAt,
  onFindSquad,
}: {
  result: LiveTrucksCityResult;
  generatedAt: string;
  onFindSquad: (county: string) => void;
}) {
  if (result.status === "unavailable") {
    return (
      <section
        role="status"
        aria-label={`${result.county}垃圾車即時位置`}
        className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
      >
        <p className="font-semibold">{result.county}：暫無即時資料</p>
        <p>
          {result.county}的垃圾車即時位置暫時無法取得（市府資料來源目前沒有回應）。你仍可到「路線與收運時間」分頁查表定的停靠點與時間，或直接洽詢清潔隊。
        </p>
        <button
          type="button"
          onClick={() => onFindSquad(result.county)}
          className="text-xs font-semibold text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
        >
          查詢{result.county}清潔隊電話
        </button>
      </section>
    );
  }

  const dataAge =
    result.dataAsOf === null ? null : Math.round((Date.parse(generatedAt) - Date.parse(result.dataAsOf)) / 1000);

  return (
    <section aria-label={`${result.county}垃圾車即時位置`} className="space-y-3">
      <h3 className="text-base font-bold text-neutral-800 dark:text-slate-100">{result.county}</h3>

      <p className="text-sm text-neutral-700 dark:text-slate-300">
        {result.dataAsOf ? (
          <>
            資料時間：<time dateTime={result.dataAsOf}>{formatTaipeiDateTime(result.dataAsOf)}</time>
            {dataAge !== null ? `（${formatTruckAge(dataAge)}）` : ""}
          </>
        ) : (
          "目前資料來源沒有任何車輛回報。"
        )}
      </p>

      {result.trucks.length > 0 ? (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            目前顯示 {result.trucks.length} 輛。綠色為 {FRESH_MINUTES} 分鐘內回報；灰色半透明表示超過 {FRESH_MINUTES} 分鐘未更新（資料較舊，車輛可能已移動或停止回報）。
            {result.hiddenCount > 0 ? `另有 ${result.hiddenCount} 輛超過 ${EXPIRED_MINUTES} 分鐘未更新或時間異常，已隱藏。` : ""}
          </p>
          <GarbageLiveMap trucks={result.trucks} />
        </>
      ) : (
        <p
          role="status"
          className="rounded-xl bg-neutral-100 p-4 text-sm text-neutral-700 dark:bg-slate-800 dark:text-slate-300"
        >
          目前沒有最近回報位置的垃圾車。垃圾車只在收運時段回報位置，非收運時段看不到車輛是正常的；表定時間請看「路線與收運時間」分頁。
          {result.hiddenCount > 0 ? `（另有 ${result.hiddenCount} 輛的最後回報已超過 ${EXPIRED_MINUTES} 分鐘，不予顯示。）` : ""}
        </p>
      )}
    </section>
  );
}

/**
 * Credits every dataset whose positions are on screen: the list comes from the
 * API's per-city `source`, so a city added to the registry is attributed
 * without editing this page. Before the first response arrives it names the
 * data's origin generically.
 */
function SourceNote({ sources }: { sources: LiveTrucksCityResult["source"][] }) {
  return (
    <p className="text-xs leading-relaxed text-neutral-500 dark:text-slate-400">
      資料來源：
      {sources.length === 0
        ? "各市政府資料開放平臺（data.gov.tw）"
        : sources.map((source, index) => (
            <span key={source.datasetUrl}>
              {index > 0 ? "、" : ""}
              {source.label}（
              <a
                href={appendOutboundUtm(source.datasetUrl, { medium: "data_source", campaign: "cleaning_squads_tool" })}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                data.gov.tw {source.datasetUrl.split("/").pop()}
              </a>
              ）
            </span>
          ))}
      ，依政府資料開放授權條款－第1版提供（data.gov.tw 目錄標示）。本頁依市府公開資料呈現車輛最後回報的位置，非本站判定；位置可能延遲或中斷，實際到站時間請以各區清潔隊公告為準。
    </p>
  );
}
