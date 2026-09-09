"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import type { HeritageCategory } from "@/lib/server/culture/ingestHeritageAssets";
import type { HeritageAssetPoint } from "@/lib/server/culture/queries";

const HeritageMapLeaflet = dynamic(() => import("@/components/HeritageMap/HeritageMapLeaflet"), { ssr: false });

interface LayerConfig {
  category: HeritageCategory;
  label: string;
  emoji: string;
  color: string;
}

const LAYERS: LayerConfig[] = [
  { category: "building", label: "古蹟／歷史建築", emoji: "🏛️", color: "#b45309" },
  { category: "archaeological_site", label: "考古遺址", emoji: "🏺", color: "#7c3aed" },
];

interface ApiResponse {
  ok: boolean;
  points?: HeritageAssetPoint[];
  updatedAt?: string | null;
  error?: string;
}

const formatUpdatedAt = (iso: string | null): string => {
  if (!iso) return "尚無同步紀錄";
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export default function HeritageMapContent() {
  const [points, setPoints] = useState<HeritageAssetPoint[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Both layers default on — this data is static/non-safety-critical, unlike
  // disaster-map's collapsed secondary layers (docs/specs/heritage-assets-map.md 5).
  const [visibleLayers, setVisibleLayers] = useState<Record<HeritageCategory, boolean>>(() =>
    Object.fromEntries(LAYERS.map((l) => [l.category, true])) as Record<HeritageCategory, boolean>,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/heritage-map");
        const json: ApiResponse = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error || "資料載入失敗");
        } else {
          setPoints(json.points ?? []);
          setUpdatedAt(json.updatedAt ?? null);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "資料載入失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const countsByLayer = useMemo(() => {
    const counts: Record<HeritageCategory, number> = { building: 0, archaeological_site: 0 };
    for (const p of points) counts[p.category] += 1;
    return counts;
  }, [points]);

  const visiblePoints = useMemo(
    () => points.filter((p) => visibleLayers[p.category]),
    [points, visibleLayers],
  );

  const toggleLayer = (category: HeritageCategory) =>
    setVisibleLayers((prev) => ({ ...prev, [category]: !prev[category] }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          🏛️ 文化資產地圖
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          整合文化部文化資產局開放資料：古蹟／歷史建築與考古遺址點位，可切換圖層查詢地點沿革與登錄理由。
        </p>
      </div>

      {/* Data source + sync-time attribution (issue #170). No safety disclaimer here —
          unlike disaster-map, this data isn't safety-critical. */}
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 text-xs leading-relaxed text-neutral-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        <p>
          資料來源：文化部文化資產局開放資料，最後同步時間：
          {loading ? "載入中…" : formatUpdatedAt(updatedAt)}
        </p>
      </div>

      {/* Layer toggles */}
      <div className="flex flex-wrap gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        {LAYERS.map((l) => (
          <label
            key={l.category}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <input
              type="checkbox"
              checked={visibleLayers[l.category]}
              onChange={() => toggleLayer(l.category)}
              className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span aria-hidden="true">{l.emoji}</span>
            <span>{l.label}</span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: l.color }}
            >
              {countsByLayer[l.category]}
            </span>
          </label>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Map */}
      <div className="h-[60vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-neutral-200 dark:border-slate-800">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingOrb />
          </div>
        ) : (
          <HeritageMapLeaflet points={visiblePoints} />
        )}
      </div>
    </div>
  );
}
