"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import {
  FOREST_FIRE_LEVELS,
  isKnownForestFireLevel,
  type ForestFireLevel,
} from "@/lib/tools/forestFire/levels";
import type { ForestFireOverview, ForestFireSiteItem } from "@/lib/server/forestFire/types";

// 林火風險區塊 (B-12 / issue #672) — mounted by OutdoorSafetyContent. It loads its
// own data from /api/outdoor-safety/forest-fire so a failure here can never take
// the rest of the outdoor-safety page down, and it never renders a level it does
// not recognise: an unknown value is dropped, not shown as 安全.

const LEVEL_STYLES: Record<
  ForestFireLevel,
  { badge: string; chip: string; dot: string }
> = {
  0: {
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    chip: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30",
    dot: "bg-emerald-600",
  },
  1: {
    badge: "bg-lime-100 text-lime-900 dark:bg-lime-950/60 dark:text-lime-300",
    chip: "border-lime-200 bg-lime-50 dark:border-lime-900/50 dark:bg-lime-950/30",
    dot: "bg-lime-500",
  },
  2: {
    badge: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/60 dark:text-yellow-300",
    chip: "border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-950/30",
    dot: "bg-yellow-400",
  },
  3: {
    badge: "bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-300",
    chip: "border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/30",
    dot: "bg-orange-500",
  },
  4: {
    badge: "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-300",
    chip: "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30",
    dot: "bg-red-600",
  },
};

// Highest first, so the most dangerous grade leads the legend.
const LEVELS_DESC: ForestFireLevel[] = [4, 3, 2, 1, 0];

const FFWI_URL = "https://ffwi.forest.gov.tw/";
const MOA_OPENAPI_URL = "https://data.moa.gov.tw/openapi.json";

const KIND_LABEL: Record<string, string> = {
  recreation_area: "森林遊樂區",
  station: "林區測站",
};

function SiteRow({ site }: { site: ForestFireSiteItem }) {
  const meta = FOREST_FIRE_LEVELS[site.level];
  const place = [site.county, site.town].filter(Boolean).join(" ");
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-neutral-800 dark:text-slate-100">
          {site.name}
        </p>
        <p className="text-xs text-neutral-500 dark:text-slate-400">
          {site.kind ? KIND_LABEL[site.kind] : "林火測點"}
          {place ? `・${place}` : ""}
          {site.stale ? `・資料日期 ${site.createdDate}（非今日）` : ""}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
          site.stale
            ? "bg-neutral-100 text-neutral-500 dark:bg-slate-800 dark:text-slate-400"
            : LEVEL_STYLES[site.level].badge
        }`}
      >
        {meta.name}・{meta.advice}
      </span>
    </li>
  );
}

interface ForestFireSectionProps {
  selectedCityCode: string;
  selectedCityName?: string;
}

export default function ForestFireSection({
  selectedCityCode,
  selectedCityName,
}: ForestFireSectionProps) {
  const [data, setData] = useState<ForestFireOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let ignore = false;
    fetchWithTimeout("/api/outdoor-safety/forest-fire", { timeoutMs: 5000 })
      .then((res) => (res.ok ? res.json() : null))
      .then((res) => {
        if (ignore) return;
        if (res && res.ok && res.data) {
          setData(res.data as ForestFireOverview);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!ignore) setStatus("error");
      });
    return () => {
      ignore = true;
    };
  }, []);

  // Defence in depth: the API already drops unknown levels; never render one here either.
  const sites = useMemo(
    () => (data?.sites ?? []).filter((s) => isKnownForestFireLevel(s.level)),
    [data],
  );
  const currentSites = useMemo(() => sites.filter((s) => !s.stale), [sites]);
  const counts = useMemo(() => {
    const out: Record<ForestFireLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const s of currentSites) out[s.level] += 1;
    return out;
  }, [currentSites]);
  const elevated = useMemo(() => currentSites.filter((s) => s.level >= 1), [currentSites]);
  const citySites = useMemo(
    () => sites.filter((s) => s.cityCode === selectedCityCode),
    [sites, selectedCityCode],
  );

  const isStaleBoard = !!data && !data.isCurrent && sites.length > 0;

  return (
    <section
      aria-labelledby="forest-fire-heading"
      className="rounded-2xl border border-orange-200 bg-white p-5 shadow-xs dark:border-orange-950/60 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3
            id="forest-fire-heading"
            className="text-lg font-black text-neutral-800 dark:text-slate-100"
          >
            🔥 林火風險・國家森林遊樂區與林區測站
          </h3>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
            依農業部開放資料「林火風險評估資訊」（林業及自然保育署林火天氣指數）公開資料呈現，非本站判定。
            進入山區、露營、烤肉、燒金紙或吸菸前請先確認。
          </p>
        </div>
        {data?.asOf && (
          <span className="shrink-0 rounded-md bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
            資料日期：{data.asOf}
          </span>
        )}
      </div>

      {status === "loading" && (
        <p className="mt-4 text-sm text-neutral-500 dark:text-slate-400">林火風險資料載入中…</p>
      )}

      {status === "error" && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300"
        >
          目前無法取得林火風險資料，請稍後再試。這不代表沒有火災風險，進入山區仍請遵守各園區用火規定，或直接查看
          林業及自然保育署林火風險評估系統。
        </p>
      )}

      {status === "ready" && sites.length === 0 && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300"
        >
          尚無林火風險資料（資料尚未同步或來源暫時無法取得）。這不代表沒有火災風險，請直接查看林業及自然保育署林火風險評估系統。
        </p>
      )}

      {status === "ready" && sites.length > 0 && data && (
        <div className="mt-4 space-y-4">
          {isStaleBoard && (
            <p
              role="status"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
            >
              今日（{data.today}）的林火資料尚未更新，以下為 {data.asOf}{" "}
              的資料，僅供參考，請以林業及自然保育署林火風險評估系統為準。
            </p>
          )}

          {/* 等級分布與官方用火建議 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {LEVELS_DESC.map((level) => {
              const meta = FOREST_FIRE_LEVELS[level];
              return (
                <div
                  key={level}
                  className={`rounded-xl border p-3 ${LEVEL_STYLES[level].chip} ${
                    isStaleBoard ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_STYLES[level].dot}`} aria-hidden="true" />
                    <span className="text-xs font-bold text-neutral-700 dark:text-slate-200">
                      {meta.name}
                    </span>
                  </div>
                  <p className="mt-1 text-2xl font-black text-neutral-800 dark:text-slate-100">
                    {isStaleBoard ? "--" : counts[level]}
                    <span className="ml-1 text-xs font-semibold text-neutral-500 dark:text-slate-400">處</span>
                  </p>
                  <p className="text-xs text-neutral-600 dark:text-slate-400">{meta.advice}</p>
                </div>
              );
            })}
          </div>

          {/* 所選縣市 */}
          <div>
            <h4 className="text-sm font-bold text-neutral-800 dark:text-slate-200">
              {selectedCityName ?? "所選縣市"}的林火測站
            </h4>
            {citySites.length > 0 ? (
              <ul className="mt-1 divide-y divide-neutral-100 dark:divide-slate-800">
                {citySites.map((site) => (
                  <SiteRow key={site.siteCode} site={site} />
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                {selectedCityName ?? "此縣市"}沒有納入林火風險評估的測站或森林遊樂區（全台共納入 {sites.length} 處），
                這不代表該地沒有林火風險。
              </p>
            )}
          </div>

          {/* 全台注意級以上 */}
          {!isStaleBoard && (
            <div>
              <h4 className="text-sm font-bold text-neutral-800 dark:text-slate-200">
                全台注意級以上（{elevated.length} 處）
              </h4>
              {elevated.length > 0 ? (
                <ul className="mt-1 divide-y divide-neutral-100 dark:divide-slate-800">
                  {elevated.map((site) => (
                    <SiteRow key={site.siteCode} site={site} />
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                  今日回報的測站與森林遊樂區皆為安全級；安全級仍須小心使用火源。
                </p>
              )}
            </div>
          )}

          <details className="rounded-lg border border-neutral-200 p-3 dark:border-slate-800">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-700 dark:text-slate-300">
              查看全部 {sites.length} 處
            </summary>
            <ul className="mt-2 divide-y divide-neutral-100 dark:divide-slate-800">
              {sites.map((site) => (
                <SiteRow key={site.siteCode} site={site} />
              ))}
            </ul>
          </details>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-neutral-500 dark:text-slate-400">
        林火天氣指數反映天氣與地表燃料的乾燥程度，並非火災是否發生的預測；「安全」級仍須小心使用火源。
        資料來源：
        <a
          href={appendOutboundUtm(MOA_OPENAPI_URL, { medium: "source_attribution", campaign: "outdoor_safety_forest_fire" })}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-neutral-700 dark:hover:text-slate-200"
        >
          農業部開放資料平臺（林火風險評估資訊）
        </a>
        ；測站位置與等級說明參考
        <a
          href={appendOutboundUtm(FFWI_URL, { medium: "source_attribution", campaign: "outdoor_safety_forest_fire" })}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-neutral-700 dark:hover:text-slate-200"
        >
          林業及自然保育署林火風險評估系統 ↗
        </a>
        。
      </p>
    </section>
  );
}
