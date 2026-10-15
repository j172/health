"use client";

import React, { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import type { WaterHardnessRow } from "@/lib/server/waterQuality/hardnessLookup";
import WaterHardnessSection, { type WaterQualityLoadState } from "./WaterHardnessSection";

interface WaterQualityApiResponse {
  ok: boolean;
  hardness?: {
    total: number;
    syncedAt: string | null;
    rows: WaterHardnessRow[];
  };
}

/**
 * Every dataset shown on this tab, with where it comes from. Add an entry here
 * when a new section is added (B-14: 6308 淨水場檢驗結果) so the attribution
 * footer stays in step with what the tab actually displays.
 */
const WATER_QUALITY_SOURCES: { name: string; provider: string; url: string }[] = [
  {
    name: "台灣自來水公司用戶水質資訊公開（鄉鎮總硬度）",
    provider: "台灣自來水股份有限公司",
    url: "https://data.gov.tw/dataset/36605",
  },
];

interface WaterQualityTabProps {
  /** Optional county to start the lookup on. */
  initialCounty?: string;
}

/**
 * The 水質 tab of /tools/water-outages (issue #673, Track B B-13). A shell of
 * independent sections over one `/api/tools/water-quality` response: today the
 * 鄉鎮總硬度 lookup; the next dataset (B-14) adds a sibling section below the
 * hardness one and a key to the same response.
 */
export default function WaterQualityTab({ initialCounty }: WaterQualityTabProps) {
  const [loadState, setLoadState] = useState<WaterQualityLoadState>("loading");
  const [hardnessRows, setHardnessRows] = useState<WaterHardnessRow[]>([]);
  const [hardnessSyncedAt, setHardnessSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchWithTimeout("/api/tools/water-quality", { timeoutMs: 8000 });
        const json = (await res.json()) as WaterQualityApiResponse;
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.hardness) {
          setLoadState("error");
          return;
        }
        setHardnessRows(json.hardness.rows);
        setHardnessSyncedAt(json.hardness.syncedAt);
        setLoadState("ready");
      } catch (err) {
        console.warn("Failed to load water quality data:", err);
        if (!cancelled) setLoadState("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <WaterHardnessSection
        rows={hardnessRows}
        syncedAt={hardnessSyncedAt}
        loadState={loadState}
        initialCounty={initialCounty}
      />

      {/* Future sections (e.g. 淨水場檢驗結果, B-14) go here, each reading its own key of the same response. */}

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
          依政府資料開放授權條款公開（授權說明見 data.gov.tw 資料集頁面）。以上為依台灣自來水公司公開資料整理的資訊，非本站判定；水質問題請洽供水單位，
          自來水客服專線 1910。
        </p>
      </div>
    </div>
  );
}
