"use client";

import React, { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import type { WaterHardnessRow } from "@/lib/server/waterQuality/hardnessLookup";
import { formatSourceDate, type WaterPlantSummary } from "@/lib/server/waterQuality/plantQualityLookup";
import WaterHardnessSection, { type WaterQualityLoadState } from "./WaterHardnessSection";
import WaterPlantQualitySection from "./WaterPlantQualitySection";

/**
 * One key per dataset; each is null when that dataset's query failed on the
 * server (the other may still be present), and absent from an older API build.
 */
interface WaterQualityApiResponse {
  ok: boolean;
  hardness?: {
    total: number;
    syncedAt: string | null;
    rows: WaterHardnessRow[];
  } | null;
  plantQuality?: {
    total: number;
    /** The data file's own 「更新日期」 (YYYY-MM-DD). */
    sourceUpdatedOn: string | null;
    syncedAt: string | null;
    plants: WaterPlantSummary[];
  } | null;
}

/**
 * Every dataset shown on this tab, with where it comes from. Add an entry here
 * when a new section is added so the attribution footer stays in step with what
 * the tab actually displays.
 */
const WATER_QUALITY_SOURCES: { name: string; provider: string; url: string }[] = [
  {
    name: "台灣自來水公司用戶水質資訊公開（鄉鎮總硬度）",
    provider: "台灣自來水股份有限公司",
    url: "https://data.gov.tw/dataset/36605",
  },
  {
    name: "台灣自來水公司水質資訊（各淨水場檢驗結果）",
    provider: "台灣自來水股份有限公司",
    url: "https://data.gov.tw/dataset/6308",
  },
];

interface WaterQualityTabProps {
  /** Optional county to start the lookup on. */
  initialCounty?: string;
}

/**
 * The 水質 tab of /tools/water-outages (Track B B-13 #673 + B-14 #676). A shell
 * of independent sections over one `/api/tools/water-quality` response: the
 * 鄉鎮總硬度 lookup and the 淨水場檢驗結果 list. Each section has its own load
 * state, so one dataset failing never blanks the other.
 */
export default function WaterQualityTab({ initialCounty }: WaterQualityTabProps) {
  const [hardnessState, setHardnessState] = useState<WaterQualityLoadState>("loading");
  const [hardnessRows, setHardnessRows] = useState<WaterHardnessRow[]>([]);
  const [hardnessSyncedAt, setHardnessSyncedAt] = useState<string | null>(null);

  const [plantState, setPlantState] = useState<WaterQualityLoadState>("loading");
  const [plants, setPlants] = useState<WaterPlantSummary[]>([]);
  const [plantFileDate, setPlantFileDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchWithTimeout("/api/tools/water-quality", { timeoutMs: 8000 });
        const json = (await res.json()) as WaterQualityApiResponse;
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setHardnessState("error");
          setPlantState("error");
          return;
        }

        if (json.hardness) {
          setHardnessRows(json.hardness.rows);
          setHardnessSyncedAt(json.hardness.syncedAt);
          setHardnessState("ready");
        } else {
          setHardnessState("error");
        }

        if (json.plantQuality) {
          setPlants(json.plantQuality.plants);
          setPlantFileDate(json.plantQuality.sourceUpdatedOn);
          setPlantState("ready");
        } else {
          setPlantState("error");
        }
      } catch (err) {
        console.warn("Failed to load water quality data:", err);
        if (!cancelled) {
          setHardnessState("error");
          setPlantState("error");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const plantDataDate = formatSourceDate(plantFileDate);

  return (
    <div className="space-y-6">
      <WaterHardnessSection
        rows={hardnessRows}
        syncedAt={hardnessSyncedAt}
        loadState={hardnessState}
        initialCounty={initialCounty}
      />

      <WaterPlantQualitySection plants={plants} sourceUpdatedOn={plantFileDate} loadState={plantState} />

      <div className="rounded-xl border border-slate-200 p-4 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <p className="font-semibold text-slate-600 dark:text-slate-300">資料來源與授權</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {WATER_QUALITY_SOURCES.map((source) => (
            <li key={source.url}>
              {source.provider}：
              <a
                href={appendOutboundUtm(source.url, { medium: "water_quality_source" })}
                target="_blank"
                rel="noreferrer noopener"
                className="text-indigo-600 hover:underline dark:text-indigo-400"
              >
                {source.name}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2">
          <strong className="font-semibold text-slate-600 dark:text-slate-300">資料日期：</strong>
          淨水場檢驗結果為{" "}
          {plantState === "loading"
            ? "載入中…"
            : plantDataDate
              ? `${plantDataDate}（取自資料檔頁尾的「更新日期」）`
              : plantState === "ready"
                ? "資料檔未載明更新日期"
                : "暫時無法取得"}
          ；鄉鎮總硬度資料檔本身不含更新日期，以該區塊標示的本站同步時間為準。
        </p>
        <p className="mt-2">
          依政府資料開放授權條款公開（授權說明見 data.gov.tw 資料集頁面）。以上為依台灣自來水公司公開資料整理的資訊，非本站判定；水質問題請洽供水單位，
          自來水客服專線{" "}
          <a href="tel:1910" className="underline">
            1910
          </a>
          。
        </p>
      </div>
    </div>
  );
}
